# Windows でのカスタム URL Protocol の設定

## config.yml の設定

外部プレイヤーとして **PotPlayer** を使用する場合、PotPlayer 自体に `potplayer://` スキームが登録されているため、追加のバッチファイルやレジストリ設定なしで直接起動できます。

```yaml
urlscheme:
  m2ts:
    win: 'potplayer://PROTOCOL://ADDRESS'
  video:
    win: 'potplayer://PROTOCOL://ADDRESS'
```

VLC media player を使用したい場合は、以下の手順でカスタム URL プロトコルハンドラを Windows に登録してください。

## URL Protocol 設定

### 0. VLC media player のインストール

[VLC media player](http://www.videolan.org/vlc/) をダウンロードしてインストールしてください

### 1. バッチファイルの作成

以下のコードを `C:\DTV\open-vlc.bat` に保存してください

`C:\Program Files\VideoLAN\VLC\vlc.exe` で渡された URL を開くようになっています

```
set vlcdata=%1
start "" "C:\Program Files\VideoLAN\VLC\vlc.exe" "%vlcdata:~8%"
```

### 2. レジストリへの登録

先程保存した open-vlc.bat を URL Protocol で呼び出せるようにレジストリを設定します

以下のコードを `reg` ファイルで保存して実行してください

```
Windows Registry Editor Version 5.00

[HKEY_CLASSES_ROOT\cvlc]
@="URL:VLC Protocol"
"URL Protocol"=""

[HKEY_CLASSES_ROOT\cvlc\DefaultIcon]

[HKEY_CLASSES_ROOT\cvlc\shell]

[HKEY_CLASSES_ROOT\cvlc\shell\open]

[HKEY_CLASSES_ROOT\cvlc\shell\open\command]
@="\"C:\\DTV\\open-vlc.bat\" \"%1"
```

アンインストール用のコードは以下のようになります

```
Windows Registry Editor Version 5.00

[-HKEY_CLASSES_ROOT\cvlc]
```

### 3. 実行

Windows で EPGDeck へアクセスして実際に動作するか確かめてください
