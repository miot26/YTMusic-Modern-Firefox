### 🗻 Overview
[YouTube Music](https://music.youtube.com) のWeb版再生UIをよりモダンに変更する**Firefox拡張機能**です。  
[Naikaku](https://github.com/naikaku1) 氏によってChrome向けに開発された [YTM_Immersion](https://github.com/naikaku1/YTM-Modern-UI) を [hacshew](https://github.com/hacshew) が独自にFirefox向けに改変しています。

<img src=".github/image/thumbnail.png" width="60%">

### 🛠️ Installation Guide
この拡張機能は，Firefox「**デバッグモード**」においてのみ使用できます。  
> [!WARNING]
> ご利用は自己責任となります。
> 
#### 1. ファイルのダウンロード
  1. [Releases](https://github.com/hacshew/mimmersion/releases) ページより，最新の `.zip` ファイルをダウンロード
  2. ファイルを任意のフォルダに展開

#### 2. Firefoxで読み込む
  1. `about:debugging#/runtime/this-firefox` に移動
  2. 「一時的な拡張機能」 の `一時的な拡張機能を読み込む` をクリック
  3. 展開したフォルダ内の `src/manifest.json` を選択し，読み込む

#### 3. 使用する
  1. YouTube Musicにアクセスして曲を再生
  2. 画面下部のコントロールバー内 `IMMERSION` をクリックしてUIを起動



### 🚀 Disclaimer & License

#### セキュリティと利用について
- 本拡張機能に、利用者の個人情報やパスワードを収集する仕組みは一切含まれません。
- 本拡張機能は、YouTube Musicの閲覧体験を向上させることを目的とした非公式の個人制作物です。
- 本拡張機能は **MIT License** のもとで公開されています。

#### 貢献について
- 問題の報告や機能の改善のご提案は，GithubのIssues，Pull Requestより随時お待ちしております。