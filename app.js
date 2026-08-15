// タブ切り替え
function switchTab(type) {
  document.getElementById('tab-encrypt').classList.toggle('active', type === 'encrypt');
  document.getElementById('tab-decrypt').classList.toggle('active', type === 'decrypt');
  document.getElementById('btn-enc').classList.toggle('active', type === 'encrypt');
  document.getElementById('btn-dec').classList.toggle('active', type === 'decrypt');
  document.getElementById('result-container').style.display = 'none';
}

// 暗号化・復号の実行（リロードを完全にブロックする処理）
document.getElementById('btn-encrypt-exec').addEventListener('click', function(e) {
  e.preventDefault(); // これでリロードを防ぐ
  handleEncrypt();
});

document.getElementById('btn-decrypt-exec').addEventListener('click', function(e) {
  e.preventDefault(); // これでリロードを防ぐ
  handleDecrypt();
});

// 暗号化ロジック
async function handleEncrypt() {
  const text = document.getElementById('enc-text').value;
  const pass = document.getElementById('enc-pass').value;
  if(!text || !pass) return alert("入力してください");
  
  // 簡易的な生成テスト（実際に動くか確認用）
  const encoded = btoa(text + ":" + pass);
  showResult("СЕКРЕТАРЬ:" + encoded);
}

// 復号ロジック
function handleDecrypt() {
  const cipher = document.getElementById('dec-cipher').value;
  const pass = document.getElementById('dec-pass').value;
  alert("解読処理を実行します (デバッグ中)");
}

function showResult(text) {
  const res = document.getElementById('result-container');
  res.style.display = 'block';
  document.getElementById('result-text').innerText = text;
}
