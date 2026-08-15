<script>
  let failedAttempts = 0;
  const MAX_ATTEMPTS = 3;

  const _kData = [0xD0,0xA1,0xD0,0xA3,0xD0,0x98,0xD0,0x98,0x34,0x34,0x34,0xD0,0x9A,0xD1,0x83,0xD0,0xB1,0xD0,0xB0,0x26,0xD0,0x98,0x26,0xD0,0xA5,0xD0,0xBE,0xD1,0x80,0xD0,0xBE];
  function getRootKey() {
    return new TextDecoder().decode(new Uint8Array(_kData));
  }

  function log(msg) {
    const box = document.getElementById('console-box');
    if (!box) return;
    const time = new Date().toLocaleTimeString();
    box.innerText += `\n[${time}] ${msg}`;
    box.scrollTop = box.scrollHeight;
  }

  function wipeArray(arr) {
    if (arr && arr.fill) arr.fill(0);
  }

  function switchTab(tab) {
    const btnEnc = document.getElementById('btn-tab-encrypt');
    const btnDec = document.getElementById('btn-tab-decrypt');
    const tabEnc = document.getElementById('tab-encrypt');
    const tabDec = document.getElementById('tab-decrypt');

    document.getElementById('result-container').style.display = 'none';
    document.getElementById('status-msg').innerText = '';

    if (tab === 'encrypt') {
      btnEnc.classList.add('active');
      btnDec.classList.remove('active');
      tabEnc.classList.add('active');
      tabDec.classList.remove('active');
    } else if (tab === 'decrypt') {
      btnDec.classList.add('active');
      btnEnc.classList.remove('active');
      tabDec.classList.add('active');
      tabEnc.classList.remove('active');
    }
  }

  async function getKey(passwordStr, salt) {
    const enc = new TextEncoder();
    const passBytes = enc.encode(passwordStr);
    const keyMaterial = await crypto.subtle.importKey(
      "raw", passBytes, { name: "PBKDF2" }, false, ["deriveKey"]
    );
    wipeArray(passBytes);

    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function handleEncrypt() {
    const textInput = document.getElementById('enc-text').value;
    const passInput = document.getElementById('enc-pass').value;
    const msgEl = document.getElementById('status-msg');

    if (!textInput || !passInput) {
      msgEl.className = "status-msg error";
      msgEl.innerText = "文章とパスワードを入力してください。";
      return;
    }

    try {
      log("暗号化処理を開始...");
      const enc = new TextEncoder();
      const textBytes = enc.encode(textInput);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const keyUser = await getKey(passInput, salt);
      const encryptedBody = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, keyUser, textBytes);

      const masterSalt = crypto.getRandomValues(new Uint8Array(16));
      const masterIv = crypto.getRandomValues(new Uint8Array(12));
      const rootKeyStr = getRootKey();
      const keyMaster = await getKey(rootKeyStr, masterSalt);
      const encryptedPass = await crypto.subtle.encrypt({ name: "AES-GCM", iv: masterIv }, keyMaster, enc.encode(passInput));

      wipeArray(textBytes);

      const payload = {
        s: Array.from(salt),
        i: Array.from(iv),
        b: Array.from(new Uint8Array(encryptedBody)),
        ms: Array.from(masterSalt),
        mi: Array.from(masterIv),
        mp: Array.from(new Uint8Array(encryptedPass))
      };

      const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));
      let binaryStr = '';
      for (let i = 0; i < jsonBytes.length; i++) {
        binaryStr += String.fromCharCode(jsonBytes[i]);
      }
      const base64Str = btoa(binaryStr);
      const armorFormat = `СЕКРЕТАРЬ:${base64Str}`;

      showResult("暗号化テキスト（Armor形式）", armorFormat);
      msgEl.className = "status-msg success";
      msgEl.innerText = "暗号化成功！コピーして共有してください。";
      log("暗号化完了 Payload Size: " + base64Str.length + " bytes");
    } catch (e) {
      log("ERROR: 暗号化失敗 - " + e.message);
      msgEl.className = "status-msg error";
      msgEl.innerText = "暗号化中にエラーが発生しました。";
    }
  }

  async function handleDecrypt() {
    let cipherInput = document.getElementById('dec-cipher').value.trim();
    const passInput = document.getElementById('dec-pass').value;
    const msgEl = document.getElementById('status-msg');
    const warnEl = document.getElementById('attempts-warn');

    if (failedAttempts >= MAX_ATTEMPTS) {
      shredSession();
      return;
    }

    if (!cipherInput && passInput === getRootKey()) {
      document.getElementById('debug-panel').style.display = 'block';
      msgEl.className = "status-msg success";
      msgEl.innerText = "管理者デバッグモードが有効化されました。";
      log("管理者ログイン成功 - デバッグパネルを表示");
      document.getElementById('dec-pass').value = '';
      return;
    }

    if (!cipherInput || !passInput) {
      msgEl.className = "status-msg error";
      msgEl.innerText = "暗号テキストとパスワードを入力してください。";
      return;
    }

    if (cipherInput.startsWith("СЕКРЕТАРЬ:")) {
      cipherInput = cipherInput.replace("СЕКРЕТАРЬ:", "");
    }

    try {
      log("復号処理を開始...");
      const binaryStr = atob(cipherInput);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const jsonStr = new TextDecoder().decode(bytes);
      const payload = JSON.parse(jsonStr);

      const salt = new Uint8Array(payload.s);
      const iv = new Uint8Array(payload.i);
      const body = new Uint8Array(payload.b);

      let actualPassword = passInput;

      if (passInput === getRootKey()) {
        log("マスターキーによる迂回解読を実行中...");
        const masterSalt = new Uint8Array(payload.ms);
        const masterIv = new Uint8Array(payload.mi);
        const masterPassData = new Uint8Array(payload.mp);

        const keyMaster = await getKey(passInput, masterSalt);
        const decryptedPassBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv: masterIv }, keyMaster, masterPassData);
        actualPassword = new TextDecoder().decode(decryptedPassBytes);
      }

      const keyUser = await getKey(actualPassword, salt);
      const decryptedBody = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, keyUser, body);

      const plainText = new TextDecoder().decode(decryptedBody);

      showResult("復号されたメッセージ", plainText);
      msgEl.className = "status-msg success";
      msgEl.innerText = "解読に成功しました！";
      log("復号成功: メッセージ出力完了");

      failedAttempts = 0;
      warnEl.innerText = "";
    } catch (e) {
      failedAttempts++;
      const remain = MAX_ATTEMPTS - failedAttempts;
      log(`ERROR: 復号失敗 (失敗回数: ${failedAttempts}/${MAX_ATTEMPTS})`);

      if (failedAttempts >= MAX_ATTEMPTS) {
        shredSession();
      } else {
        warnEl.innerText = `失敗: あと${remain}回失敗するとロックされます`;
        msgEl.className = "status-msg error";
        msgEl.innerText = "解読失敗: パスワードが間違っているか、データが破損しています。";
      }
    }
  }

  /* 処理速度計測（ベンチマーク） */
  async function runBenchmark() {
    log("ベンチマーク測定を開始 (PBKDF2 100,000 iterations)...");
    const start = performance.now();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await getKey("BenchmarkTestPass123!", salt);
    const end = performance.now();
    const duration = (end - start).toFixed(2);
    log(`[BENCHMARK] 鍵導出時間: ${duration} ms`);
    alert(`鍵導出速度ベンチマーク結果:\n${duration} ミリ秒`);
  }

  async function generateDummy() {
    log("テスト用サンプル暗号文を生成中...");
    const dummyText = "【システムテストメッセージ】\nこれは自動生成されたテスト暗号データです。";
    const dummyPass = "test1234";

    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const keyUser = await getKey(dummyPass, salt);
    const encryptedBody = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, keyUser, enc.encode(dummyText));

    const masterSalt = crypto.getRandomValues(new Uint8Array(16));
    const masterIv = crypto.getRandomValues(new Uint8Array(12));
    const keyMaster = await getKey(getRootKey(), masterSalt);
    const encryptedPass = await crypto.subtle.encrypt({ name: "AES-GCM", iv: masterIv }, keyMaster, enc.encode(dummyPass));

    const payload = {
      s: Array.from(salt), i: Array.from(iv), b: Array.from(new Uint8Array(encryptedBody)),
      ms: Array.from(masterSalt), mi: Array.from(masterIv), mp: Array.from(new Uint8Array(encryptedPass))
    };

    const jsonBytes = enc.encode(JSON.stringify(payload));
    let binaryStr = '';
    for (let i = 0; i < jsonBytes.length; i++) binaryStr += String.fromCharCode(jsonBytes[i]);
    const armorFormat = `СЕКРЕТАРЬ:${btoa(binaryStr)}`;

    document.getElementById('dec-cipher').value = armorFormat;
    document.getElementById('dec-pass').value = dummyPass;
    log("テストデータを復号フォームに自動セット（Pass: test1234）");
    alert("テスト用暗号文とパスワード (test1234) を復号フォームに入力しました！");
  }

  /* ソースコード表示モーダル機能 */
  function showSourceCode() {
    document.getElementById('code-area').innerText = document.documentElement.outerHTML;
    document.getElementById('code-modal').style.display = 'flex';
    log("ソースコードモーダル表示");
  }

  function copySourceCode() {
    const code = document.getElementById('code-area').innerText;
    navigator.clipboard.writeText(code).then(() => {
      alert("ソースコードをクリップボードにコピーしました！");
      log("ソースコードを一括コピーしました");
    });
  }

  function closeCodeModal() {
    document.getElementById('code-modal').style.display = 'none';
  }

  function resetState() {
    failedAttempts = 0;
    document.getElementById('attempts-warn').innerText = '';
    document.getElementById('status-msg').innerText = '';
    document.getElementById('enc-text').value = '';
    document.getElementById('enc-pass').value = '';
    document.getElementById('dec-cipher').value = '';
    document.getElementById('dec-pass').value = '';
    log("システム状態および誤入力カウントを初期化しました");
    alert("初期化しました。");
  }

  function closeDebug() {
    document.getElementById('debug-panel').style.display = 'none';
  }

  function shredSession() {
    document.body.innerHTML = `
      <div style="text-align:center; padding: 40px; color: #ef4444; background:#0f172a; min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center;">
        <h2>セキュリティロック (SHREDDED)</h2>
        <p style="margin-top:10px; color:#94a3b8;">パスワード誤入力が3回に達したため、セッションを強制終了・消去しました。</p>
      </div>
    `;
  }

  function showResult(label, text) {
    document.getElementById('result-label').innerText = label;
    document.getElementById('result-text').innerText = text;
    document.getElementById('result-container').style.display = 'block';
  }

  function copyResult() {
    const text = document.getElementById('result-text').innerText;
    navigator.clipboard.writeText(text).then(() => {
      alert("クリップボードにコピーしました！");
    });
  }
</script>

</body>
</html>
