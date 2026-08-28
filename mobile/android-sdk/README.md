# platform-android-sdk

Android 原生 SDK（規劃中）。

採集能力：Build props、ABI、CPU、Screen、Sensor；Root/Magisk/Xposed/Frida；模擬器、雙開空間、Work Profile；VPN/Proxy、DNS、WebView 版本；App 簽名、installer source、debuggable flag。

設計重點：Native SDK + server challenge，避免只靠本地判斷。Android 是偵測雙開、模擬器、Hook、重打包的主戰場。
