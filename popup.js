// デフォルト設定
const DEFAULT_SETTINGS = {
  hostUrl: 'www.chatwork.com',
  intervalTime: 300,
  targetRoomIds: '',
  exceptRoomIds: '',
  appendDate: true,
  appendUsername: true,
  deleteReactions: false,
  downloadAttachments: true
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
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status show ${type}`;

  setTimeout(() => {
    statusDiv.classList.remove('show');
  }, 3000);
}

// フォームに設定を反映
function populateForm(settings) {
  document.getElementById('hostUrl').value = settings.hostUrl;
  document.getElementById('intervalTime').value = settings.intervalTime;
  document.getElementById('targetRoomIds').value = settings.targetRoomIds;
  document.getElementById('exceptRoomIds').value = settings.exceptRoomIds;
  document.getElementById('appendDate').checked = settings.appendDate;
  document.getElementById('appendUsername').checked = settings.appendUsername;
  document.getElementById('deleteReactions').checked = settings.deleteReactions;
  document.getElementById('downloadAttachments').checked = settings.downloadAttachments;
}

// フォームから設定を取得
function getFormSettings() {
  return {
    hostUrl: document.getElementById('hostUrl').value.trim() || DEFAULT_SETTINGS.hostUrl,
    intervalTime: parseInt(document.getElementById('intervalTime').value) || DEFAULT_SETTINGS.intervalTime,
    targetRoomIds: document.getElementById('targetRoomIds').value.trim(),
    exceptRoomIds: document.getElementById('exceptRoomIds').value.trim(),
    appendDate: document.getElementById('appendDate').checked,
    appendUsername: document.getElementById('appendUsername').checked,
    deleteReactions: document.getElementById('deleteReactions').checked,
    downloadAttachments: document.getElementById('downloadAttachments').checked
  };
}

// 設定を保存するボタンのハンドラ
async function handleSave() {
  const settings = getFormSettings();
  await saveSettings(settings);
  showStatus('設定を保存しました', 'success');
}

// エクスポートを実行するボタンのハンドラ
async function handleExport() {
  // まず設定を保存
  const settings = getFormSettings();
  await saveSettings(settings);

  // アクティブなタブを取得
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Chatworkのページかチェック
  if (!tab.url || !(tab.url.includes('chatwork.com') || tab.url.includes('kcw.kddi.ne.jp'))) {
    showStatus('Chatworkのページで実行してください', 'error');
    return;
  }

  // コンテンツスクリプトにメッセージを送信
  try {
    chrome.tabs.sendMessage(tab.id, { action: 'exportLogs', settings: settings }, (response) => {
      if (chrome.runtime.lastError) {
        showStatus('エラー: ' + chrome.runtime.lastError.message, 'error');
        return;
      }

      if (response && response.success) {
        showStatus('エクスポートを開始しました', 'success');
      } else {
        showStatus('エクスポートの開始に失敗しました', 'error');
      }
    });
  } catch (error) {
    showStatus('エラー: ' + error.message, 'error');
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  // 設定を読み込んでフォームに反映
  const settings = await loadSettings();
  populateForm(settings);

  // イベントリスナーを設定
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  document.getElementById('exportBtn').addEventListener('click', handleExport);
});
