// デフォルト設定
const DEFAULT_SETTINGS = {
  hostUrl: "www.chatwork.com",
  intervalTime: 300,
  targetRoomIds: "",
  exceptRoomIds: "",
  appendDate: true,
  appendUsername: true,
  deleteReactions: false,
  downloadAttachments: true,
  exportJson: false,
};

// 設定を読み込む
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      resolve(settings);
    });
  });
}

// 設定を保存する
async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(settings, () => {
      resolve();
    });
  });
}

// ステータスメッセージを表示
function showStatus(message, type = "info") {
  const statusDiv = document.getElementById("status");
  statusDiv.textContent = message;
  statusDiv.className = `status show ${type}`;

  setTimeout(() => {
    statusDiv.classList.remove("show");
  }, 3000);
}

// フォームに設定を反映
function populateForm(settings) {
  document.getElementById("hostUrl").value = settings.hostUrl;
  document.getElementById("intervalTime").value = settings.intervalTime;
  document.getElementById("targetRoomIds").value = settings.targetRoomIds;
  document.getElementById("exceptRoomIds").value = settings.exceptRoomIds;
  document.getElementById("appendDate").checked = settings.appendDate;
  document.getElementById("appendUsername").checked = settings.appendUsername;
  document.getElementById("deleteReactions").checked = settings.deleteReactions;
  document.getElementById("downloadAttachments").checked =
    settings.downloadAttachments;
  document.getElementById("exportJson").checked = settings.exportJson;
}

// フォームから設定を取得
function getFormSettings() {
  return {
    hostUrl:
      document.getElementById("hostUrl").value.trim() ||
      DEFAULT_SETTINGS.hostUrl,
    intervalTime:
      parseInt(document.getElementById("intervalTime").value) ||
      DEFAULT_SETTINGS.intervalTime,
    targetRoomIds: document.getElementById("targetRoomIds").value.trim(),
    exceptRoomIds: document.getElementById("exceptRoomIds").value.trim(),
    appendDate: document.getElementById("appendDate").checked,
    appendUsername: document.getElementById("appendUsername").checked,
    deleteReactions: document.getElementById("deleteReactions").checked,
    downloadAttachments: document.getElementById("downloadAttachments").checked,
    exportJson: document.getElementById("exportJson").checked,
  };
}

// 設定を保存するボタンのハンドラ
async function handleSave() {
  const settings = getFormSettings();
  await saveSettings(settings);
  showStatus("設定を保存しました", "success");
}

// コンテンツスクリプトを注入する
async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"],
      world: "ISOLATED",
    });
    return true;
  } catch (error) {
    console.error("Failed to inject content script:", error);
    return false;
  }
}

// エクスポートスクリプトをページのメインワールドで実行
async function executeExportInMainWorld(tabId, settings) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: runExportScript,
      args: [settings],
    });
    return true;
  } catch (error) {
    console.error("Failed to execute script in main world:", error);
    return false;
  }
}

// ページコンテキストで実行されるエクスポート関数
async function runExportScript(settings) {
  console.log("Chatwork Log Exporter: Starting export in page context");

  // 設定
  const TARGET_ROOM_IDS = settings.targetRoomIds
    ? settings.targetRoomIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id))
    : [];
  const EXCEPT_ROOM_IDS = settings.exceptRoomIds
    ? settings.exceptRoomIds
        .split(",")
        .map((id) => parseInt(id.trim()))
        .filter((id) => !isNaN(id))
    : [];
  const INTERVAL_TIME = settings.intervalTime;
  const HOST_URL = settings.hostUrl;
  const APPEND_DATE = settings.appendDate;
  const APPEND_USERNAME = settings.appendUsername;
  const DELETE_REACTIONS = settings.deleteReactions;
  const DOWNLOAD_ATTACHMENTS = settings.downloadAttachments;
  const EXPORT_JSON = settings.exportJson;

  // ページのコンテキストから直接トークンを取得
  const token = window.ACCESS_TOKEN;
  const myid = window.MYID;

  if (!token || !myid) {
    console.error("Chatwork Log Exporter: ACCESS_TOKEN or MYID not found");
    console.error(
      "ACCESS_TOKEN:",
      typeof window.ACCESS_TOKEN,
      window.ACCESS_TOKEN,
    );
    console.error("MYID:", typeof window.MYID, window.MYID);
    alert(
      "エラー: Chatworkの認証情報が取得できませんでした。ページをリロードしてから再度お試しください。",
    );
    return;
  }

  console.log("Chatwork Log Exporter: Successfully obtained token and myid");

  async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function do_fetch({ url, formData }) {
    const _formData = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      _formData.append(key, value);
    });
    const resp = await fetch(url, {
      method: "POST",
      mode: "cors",
      cache: "no-cache",
      credentials: "same-origin",
      redirect: "follow",
      referrerPolicy: "same-origin",
      body: _formData,
    });
    return resp;
  }

  async function saveAs(filename, content) {
    console.log("Chatwork Log Exporter: Saving file:", filename);
    let blob;
    if (typeof content === "string") {
      blob = new Blob([content], { type: "application/force-download" });
    } else if (content instanceof Blob) {
      blob = new Blob([content], { type: "application/force-download" });
    } else {
      blob = new Blob([JSON.stringify(content, null, 2)], {
        type: "application/force-download",
      });
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.dataType = "binary";
    link.download = filename;
    link.click();
    link.remove();
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1e4);
  }

  function convertMessagesToCSV(messages) {
    if (!messages || messages.length === 0) return "";
    const headers = [
      "id",
      "aid",
      "aid_name",
      "datetime",
      "type",
      "msg",
      "tm",
      "utm",
      "index",
      "reactions",
    ];
    const csvRows = [headers.join(",")];
    for (const message of messages) {
      const values = [
        message.id || "",
        message.aid || "",
        message.aid_name
          ? `"${String(message.aid_name).replace(/"/g, '""')}"`
          : "",
        message.datetime
          ? `"${String(message.datetime).replace(/"/g, '""')}"`
          : "",
        message.type || "",
        message.msg
          ? `"${String(message.msg).replace(/"/g, '""').replace(/\n/g, "\\n")}"`
          : "",
        message.tm || "",
        message.utm || "",
        message.index || "",
        message.reactions
          ? `"${JSON.stringify(message.reactions).replace(/"/g, '""')}"`
          : "",
      ];
      csvRows.push(values.join(","));
    }
    return csvRows.join("\n");
  }

  async function init_load() {
    const url = `https://${HOST_URL}/gateway/init_load.php?myid=${myid}&_v=1.80a&_av=5&ln=en&rid=0&with_unconnected_in_organization=1`;
    const resp = await do_fetch({
      url: url,
      formData: { pdata: JSON.stringify({ _t: token }) },
    });
    return resp.json();
  }

  async function get_account_info(aids) {
    const url = `https://${HOST_URL}/gateway/get_account_info.php?myid=${myid}&_v=1.80a&_av=5&ln=en&get_private_data=0`;
    const resp = await do_fetch({
      url: url,
      formData: { pdata: JSON.stringify({ aid: aids, _t: token }) },
    });
    return resp.json();
  }

  async function load_chat(rid) {
    const url = `https://${HOST_URL}/gateway/load_chat.php?myid=${myid}&_v=1.80a&_av=5&ln=en&room_id=${rid}&last_chat_id=0&unread_num=0&bookmark=1&file=1&desc=1`;
    const resp = await do_fetch({
      url: url,
      formData: {
        pdata: JSON.stringify({ load_file_version: "2", _t: token }),
      },
    });
    return resp.json();
  }

  async function load_old_chat(rid, first_chat_id) {
    const url = `https://${HOST_URL}/gateway/load_old_chat.php?myid=${myid}&_v=1.80a&_av=5&ln=en&room_id=${rid}&first_chat_id=${first_chat_id}`;
    const resp = await do_fetch({
      url: url,
      formData: { pdata: JSON.stringify({ _t: token }) },
    });
    return resp.json();
  }

  async function get_attachment_as_blob(file_id) {
    const resp = await fetch(
      `https://${HOST_URL}/gateway/download_file.php?bin=1&file_id=${file_id}&preview=0`,
    );
    return resp.blob();
  }

  async function get_messages(room_id) {
    const sort_by_id = (a, b) => Number(a.id) - Number(b.id);
    let messages = [];
    let oldest_msg_id = 0;
    do {
      const load_old_chat_json = await load_old_chat(room_id, oldest_msg_id);
      load_old_chat_json.result.chat_list.sort(sort_by_id);
      messages.unshift(...load_old_chat_json.result.chat_list);
      oldest_msg_id = load_old_chat_json.result.chat_list?.[0]?.id;
      await sleep(INTERVAL_TIME);
    } while (oldest_msg_id !== undefined);
    return messages;
  }

  async function customize_messages(messages, aids) {
    const yyyymmddhhmmss = new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    for (const message of messages) {
      if (APPEND_DATE)
        message.datetime = yyyymmddhhmmss.format(new Date(message.tm * 1000));
      if (APPEND_USERNAME)
        message.aid_name =
          aids.result.account_dat[message.aid]?.name || "ユーザー名情報なし";
      if (DELETE_REACTIONS) delete message.reactions;
    }
  }

  async function downloadChatRoom(room_id) {
    const load_chat_json = await load_chat(room_id);
    const messages = await get_messages(room_id);
    const aids = messages.reduce(
      (prev, message) => prev.add(message.aid),
      new Set(),
    );
    const account_info_json = await get_account_info([...aids]);

    await customize_messages(messages, account_info_json);

    const csvContent = convertMessagesToCSV(messages);
    await saveAs(`${room_id}_messages.csv`, csvContent);

    if (EXPORT_JSON) {
      await saveAs(`${room_id}_load_chat.json`, load_chat_json);
      await saveAs(`${room_id}_account_info.json`, account_info_json);
      await saveAs(`${room_id}_messages.json`, messages);
    }

    if (DOWNLOAD_ATTACHMENTS) {
      for (const file of load_chat_json.result?.file_list || []) {
        await saveAs(
          `${room_id}_${file.id}_${file.fn}`,
          await get_attachment_as_blob(file.id),
        );
        await sleep(INTERVAL_TIME);
      }
    }
  }

  async function downloadChatRooms() {
    const init_load_json = await init_load();
    if (EXPORT_JSON) {
      await saveAs("init_load.json", init_load_json);
    }

    for (const [room_id, room_obj] of Object.entries(
      init_load_json.result.room_dat,
    )) {
      const room_name =
        room_obj?.n ||
        Object.entries(init_load_json.result?.contact_dat)?.filter(
          ([k, v]) => v.rid == room_id,
        )?.[0]?.[1]?.name ||
        "ルーム名なし";
      if (
        EXCEPT_ROOM_IDS.includes(Number(room_id)) ||
        (TARGET_ROOM_IDS.length !== 0 &&
          !TARGET_ROOM_IDS.includes(Number(room_id)))
      ) {
        console.log("Skipping room:", room_id, room_name);
        continue;
      }
      console.log("Downloading room:", room_id, room_name);
      await downloadChatRoom(room_id);
    }
    alert("エクスポートが完了しました");
  }

  try {
    await downloadChatRooms();
  } catch (error) {
    console.error("Error during export:", error);
    alert("エクスポート中にエラーが発生しました: " + error.message);
  }
}

// エクスポートを実行するボタンのハンドラ
async function handleExport() {
  const settings = getFormSettings();
  await saveSettings(settings);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (
    !tab.url ||
    !(tab.url.includes("chatwork.com") || tab.url.includes("kcw.kddi.ne.jp"))
  ) {
    showStatus("Chatworkのページで実行してください", "error");
    return;
  }

  try {
    const success = await executeExportInMainWorld(tab.id, settings);
    if (success) {
      showStatus("エクスポートを開始しました", "success");
    } else {
      showStatus("エクスポートの開始に失敗しました", "error");
    }
  } catch (error) {
    showStatus("エラー: " + error.message, "error");
  }
}

// 初期化
document.addEventListener("DOMContentLoaded", async () => {
  // 設定を読み込んでフォームに反映
  const settings = await loadSettings();
  populateForm(settings);

  // イベントリスナーを設定
  document.getElementById("saveBtn").addEventListener("click", handleSave);
  document.getElementById("exportBtn").addEventListener("click", handleExport);
});
