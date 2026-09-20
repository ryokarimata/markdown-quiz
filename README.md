# Markdown Quiz — Obsidian用4択問題プラグイン

Markdownの `quiz` コードブロックに書いた問題に、その場で回答できます。ビルド不要・追加プラグイン不要です。

## インストール

1. [Releases](https://github.com/ryokarimata/markdown-quiz/releases/latest)から `markdown-quiz.zip` をダウンロードし、展開します。
2. 利用するObsidian保管庫の `.obsidian/plugins/` 内へ `markdown-quiz` フォルダをコピーします。`plugins` がなければ作成してください。
3. 以下の配置になっていることを確認します（同名フォルダを二重にしないでください）。

   ```text
   保管庫/
     .obsidian/
       plugins/
         markdown-quiz/
           manifest.json
           main.js
           styles.css
   ```

4. Obsidianを再起動します。「設定 → コミュニティプラグイン」で制限モードを無効にし、「Markdown Quiz」を有効にします。
5. 同梱の `サンプル問題.md` を保管庫の通常のノートフォルダへコピーし、Obsidianで開きます。
6. **閲覧モード**で回答してください。ライブプレビューでも、カーソルをコードブロックの外へ移すと表示されます。ソースモードではコードのままです。

## 問題の作成

以下をノートに貼り付けて編集してください。コマンドパレットの「Markdown Quiz: 4択問題のテンプレートを挿入」も使えます。

````markdown
```quiz
question: ソフトウェアの統合開発環境として提供されているOSSはどれか。

options:
  - Apache Tomcat
  - Eclipse
  - GCC
  - Linux

answer: 2

explanation: |
  Eclipseは統合開発環境（IDE）です。

  - Apache Tomcat → Webアプリケーションサーバ
  - Eclipse → 統合開発環境
  - GCC → コンパイラ
  - Linux → OS
```
````

- `question`：問題文。複数行にする場合は `question: |` の次の行から半角スペース2つで字下げします。
- `options`：文字列の選択肢を必ず4つ。数値だけなら `"10"` のように引用符で囲んでください。
- `answer`：正解の位置を1〜4で指定します。引用符は不要です。
- `explanation`：必須。`|` の次の行から解説全体を半角スペース2つで字下げします。太字・箇条書きなどのMarkdownに対応します。
- 問題文と選択肢はプレーンテキストで表示します。
- 文字列に `: ` や `#` などのYAMLの記号を含める場合は、引用符や `|` を使ってください。
- 最後の閉じる3つのバッククォートを忘れずに書いてください。
- 1問につき1つの `quiz` ブロックを書きます。同じノートに複数置けます。

## 回答の流れ

1. 未回答時は問題と4つの選択肢を表示します。正解・解説はDOMにも生成しません。
2. 選択肢をクリックすると即座にロックし、「○ 正解」または「× 不正解」を表示します。
3. あなたの回答、正解の番号と選択肢、その下に解説を表示します。
4. 回答後は4つとも選択不可になります。色に加えて文字でも判定します。
5. 「リセット」で判定と解説を消し、再回答できます。他の問題には影響しません。

キーボードのTabで移動し、Enter / Spaceでも回答できます。

## 回答状態について

回答状態は表示中の問題ごとにメモリ内で保持します。成績の保存・集計は行いません。ノートの再表示、コードブロックの再描画、アプリの再起動などでは未回答に戻ります。安定して解く場合は閲覧モードを使用してください。

ノート自体には正解・解説が保存されているため、Markdownを編集すれば内容を読めます。学習用の表示制御です。

既存の `quiz` ブロックを扱う別プラグインがある場合は、同時使用を避けてください。

## 開発と確認

`main.js` がそのまま配布用ソースです。Obsidian標準APIのみを使います。テンプレート挿入コマンドを実行した場合のみ、編集中のノートへひな形を挿入します。デスクトップ・モバイル共通のAPIを使用しています。

## プライバシー

アカウント登録・課金・利用状況の収集はありません。プラグイン独自の外部通信は行わず、回答履歴も保存しません。解説はObsidianのMarkdown描画機能を使用するため、利用者が解説に外部画像などを記述した場合は、その表示に伴う通信が発生することがあります。

## ライセンス

[MIT License](LICENSE)。作者：port22。Obsidian公式の製品ではありません。

## 不具合の報告

[Issues](https://github.com/ryokarimata/markdown-quiz/issues)へ、Obsidianのバージョン、OS、再現手順、個人情報を除いた問題ブロックの例を記載してください。

## API資料・テスト

公式API資料：
- https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Markdown%20post%20processing.md
- https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts

自動テストは同梱の `tests/quiz.test.cjs` です。開発環境で `npm install`、`npm test` の順に実行します。インストール先のObsidianではこれらのコマンドは不要です。

自動テスト9件に合格しています（DOM環境とObsidian APIのモックを使用）。未回答時の非表示、即時採点、回答ロック、繰り返しリセット、複数問題の独立性、不正な入力、非同期描画中のリセット、描画失敗時のフォールバック、破棄時の処理、テンプレートを確認しました。

Obsidian実機での表示確認は未実施です。導入後、サンプルで「誤答 → 選択変更不可 → リセット → 正答」を確認してください。
