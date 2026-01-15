// Chrome拡張機能からのメッセージを受け取る
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'exportLogs') {
    startExport(request.settings);
    sendResponse({ success: true });
  }
  return true;
});

// エクスポート処理を開始
async function startExport(settings) {
  console.log('Chatwork Log Exporter: Starting export with settings:', settings);

  // 設定からルームIDの配列を作成
  const TARGET_ROOM_IDS = settings.targetRoomIds
    ? settings.targetRoomIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : [];

  const EXCEPT_ROOM_IDS = settings.exceptRoomIds
    ? settings.exceptRoomIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
    : [];

  const INTERVAL_TIME = settings.intervalTime;
  const HOST_URL = settings.hostUrl;
  const APPEND_DATE = settings.appendDate;
  const APPEND_USERNAME = settings.appendUsername;
  const DELETE_REACTIONS = settings.deleteReactions;
  const DOWNLOAD_ATTACHMENTS = settings.downloadAttachments;

  // 必要な変数を取得（Chatworkのページから）
  const token = window.ACCESS_TOKEN;
  const myid = window.MYID;

  if (!token || !myid) {
    console.error('Chatwork Log Exporter: ACCESS_TOKEN or MYID not found. Please make sure you are on a Chatwork page and logged in.');
    alert('エラー: Chatworkにログインしているか確認してください');
    return;
  }

  // ヘルパー関数
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
    console.log('Chatwork Log Exporter: Saving file:', filename);

    let blob;
    if (typeof content === "string") {
      blob = new Blob([content], {
        type: "application/force-download",
      });
    } else if (content instanceof Blob) {
      blob = new Blob([content], {
        type: "application/force-download",
      });
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

  async function init_load() {
    console.log('Chatwork Log Exporter: Initializing load');
    const url = `https://${HOST_URL}/gateway/init_load.php?myid=${myid}&_v=1.80a&_av=5&ln=en&rid=0&with_unconnected_in_organization=1`;
    const resp = await do_fetch({
      url: url,
      formData: {
        pdata: JSON.stringify({
          _t: token,
        }),
      },
    });
    return resp.json();
  }

  async function get_account_info(aids) {
    console.log('Chatwork Log Exporter: Getting account info for', aids.length, 'accounts');
    const url = `https://${HOST_URL}/gateway/get_account_info.php?myid=${myid}&_v=1.80a&_av=5&ln=en&get_private_data=0`;
    const resp = await do_fetch({
      url: url,
      formData: {
        pdata: JSON.stringify({
          aid: aids,
          _t: token,
        }),
      },
    });
    return resp.json();
  }

  async function load_chat(rid) {
    console.log('Chatwork Log Exporter: Loading chat for room', rid);
    const url = `https://${HOST_URL}/gateway/load_chat.php?myid=${myid}&_v=1.80a&_av=5&ln=en&room_id=${rid}&last_chat_id=0&unread_num=0&bookmark=1&file=1&desc=1`;
    const resp = await do_fetch({
      url: url,
      formData: {
        pdata: JSON.stringify({
          load_file_version: "2",
          _t: token,
        }),
      },
    });
    return resp.json();
  }

  async function load_old_chat(rid, first_chat_id) {
    console.log('Chatwork Log Exporter: Loading old chat for room', rid, 'from', first_chat_id);
    const url = `https://${HOST_URL}/gateway/load_old_chat.php?myid=${myid}&_v=1.80a&_av=5&ln=en&room_id=${rid}&first_chat_id=${first_chat_id}`;
    const resp = await do_fetch({
      url: url,
      formData: {
        pdata: JSON.stringify({
          _t: token,
        }),
      },
    });
    return resp.json();
  }

  async function get_attachment_as_blob(file_id) {
    console.log('Chatwork Log Exporter: Getting attachment', file_id);
    const resp = await fetch(
      `https://${HOST_URL}/gateway/download_file.php?bin=1&file_id=${file_id}&preview=0`,
    );
    return resp.blob();
  }

  async function get_messages(room_id) {
    console.log('Chatwork Log Exporter: Getting all messages for room', room_id);
    const sort_by_id = (a, b) => {
      return Number(a.id) - Number(b.id);
    };
    let messages = [];
    let oldest_msg_id = 0;
    do {
      console.log('Chatwork Log Exporter: Fetching messages, oldest_msg_id:', oldest_msg_id);
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
      fractionalSecondDigits: undefined,
    });

    for (const message of messages) {
      if (APPEND_DATE) {
        message.datetime = yyyymmddhhmmss.format(new Date(message.tm * 1000));
      }

      if (APPEND_USERNAME) {
        message.aid_name =
          aids.result.account_dat[message.aid]?.name || "ユーザー名情報なし";
      }

      if (DELETE_REACTIONS) {
        delete message.reactions;
      }
    }
  }

  async function downloadChatRoom(room_id) {
    console.log('Chatwork Log Exporter: Downloading chat room', room_id);

    // チャットルーム情報を取得
    {
      const load_chat_json = await load_chat(room_id);
      await saveAs(`${room_id}_load_chat.json`, load_chat_json);
    }

    {
      // 全メッセージを取得
      console.log('Chatwork Log Exporter: Getting messages');
      const messages = await get_messages(room_id);

      // チャット内で発言したすべてのメンバーの情報を取得・保存
      console.log('Chatwork Log Exporter: Getting account info');
      const aids = messages.reduce((prev, message) => {
        return prev.add(message.aid);
      }, new Set());
      const account_info_json = await get_account_info([...aids]);
      await saveAs(`${room_id}_account_info.json`, account_info_json);

      // メッセージのカスタマイズ（日付時刻付与など）
      await customize_messages(messages, account_info_json);

      // メッセージの保存
      await saveAs(`${room_id}_messages.json`, messages);
    }

    // 全添付ファイルをダウンロード
    if (DOWNLOAD_ATTACHMENTS) {
      console.log('Chatwork Log Exporter: Downloading attachments');
      const load_chat_json = await load_chat(room_id);
      for (const file of load_chat_json.result?.file_list || []) {
        const file_id = file.id;
        const file_name = `${room_id}_${file_id}_${file.fn}`;
        await saveAs(file_name, await get_attachment_as_blob(file_id));
        await sleep(INTERVAL_TIME);
      }
    }
  }

  async function downloadChatRooms() {
    console.log('Chatwork Log Exporter: Downloading chat rooms');
    const init_load_json = await init_load();
    await saveAs("init_load.json", init_load_json);

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
        console.log('Chatwork Log Exporter: Skipping room:', room_id, room_name);
        continue;
      }

      console.log('Chatwork Log Exporter: Downloading room:', room_id, room_name);

      // わかりやすさのため、ルーム名の空ファイルを作成
      await saveAs(`${room_id}_${room_name}.txt`, " ");

      await downloadChatRoom(room_id);
    }

    console.log('Chatwork Log Exporter: Export completed!');
    alert('エクスポートが完了しました');
  }

  // エクスポート実行
  try {
    await downloadChatRooms();
  } catch (error) {
    console.error('Chatwork Log Exporter: Error during export:', error);
    alert('エクスポート中にエラーが発生しました: ' + error.message);
  }
}
