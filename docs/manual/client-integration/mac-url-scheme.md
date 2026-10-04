# macOS でのカスタム URL Scheme の設定

macOS で外部動画プレイヤーを起動する方法として、モダンなオープンソースプレイヤー **[IINA](https://iina.io/)** を利用する方法（推奨）と、AppleScript で VLC 起動用アプレットを作成する方法があります。

## 方法 1: IINA を使用する（推奨・簡単）

IINA をインストールしている場合、標準で URL スキームが登録されているため、アプレット作成不要で `config.yml` の設定のみで利用できます。

```yaml
urlscheme:
  m2ts:
    mac: 'iina://weblink?url=PROTOCOL%3A%2F%2FADDRESS'
  video:
    mac: 'iina://weblink?url=PROTOCOL%3A%2F%2FADDRESS'
```

---

## 方法 2: AppleScript で VLC 用カスタム URL Scheme アプリを作成する

VLC を使用したい場合、VLC 自体には URL スキームハンドラが内蔵されていないため、AppleScript でラッパーアプレットを作成します。

### 1. アプレットの作成

以下のコードを AppleScript Editor で記述してアプレットとして書き出してください

`/Applications/VLC.app` で渡された URL を開くようになっています

```
on open location url_scheme
	(*デリミタで文字列抽出*)
	set AppleScript's text item delimiters to {"cvlc://"}
	set txt_items to text items of url_scheme
	set AppleScript's text item delimiters to {""}
	set scheme_txt to txt_items as Unicode text

	do shell script ({"/Applications/VLC.app/Contents/MacOS/VLC ", "https://" & scheme_txt} as string)
end open location
```

### 2. info.plist の編集

書き出したアプレットの info.plist を編集します。

書き出したアプレットのを右クリック -> パッケージ内容を表示 -> Contents -> Info.plist

以下を追加してください

```
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLName</key>
        <string>biz.corecara.cvlc</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>cvlc</string>
        </array>
    </dict>
</array>
```

### 3. 実行

macOS の Chrome or Firefox で EPGDeck へアクセスして実際に動作するか確かめてください
