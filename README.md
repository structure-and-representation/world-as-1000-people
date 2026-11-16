# 世界を1000人で表すと

https://world-as-1000-people.structure-and-representation.com/

世界の人口を1000個のボールに置き換え、地域・年齢・所得で分けて見る立体グラフです。
分け方を切り替えると、仕切りが消えてボールが崩れ、新しい筒に注がれます。

- 年：1950年から2100年まで25年刻み（7時点）
- 横に分ける／奥に分ける：地域・年齢・所得
- 色：分け方とは別の軸を選べます
- 筒をタップすると、その筒の内訳が出ます
- 筒の底面積はすべて同じなので、高さがそのまま人数を表します

## 構成

| パス | 内容 |
|---|---|
| `index.html` | 公開するページ（データとスクリプトを埋め込み済み。これ1枚で動きます） |
| `ogp.png` | 共有用の画像（1200×630） |
| `src/head.html`, `src/app.js` | ページの元ファイル |
| `data/data.json` | 各年の1000個の割り当て |
| `scripts/prep.py` | 国連データから `data/data.json` を作る |
| `scripts/build.py` | `src/` と `data/` から `index.html` を組み立てる |

描画には three.js r128 を cdnjs から読み込んでいます。

## データの作り直し

```sh
git clone --depth 1 https://github.com/PPgp/wpp2024.git
pip install rdata pandas
python3 scripts/prep.py wpp2024/data data/data.json
python3 scripts/build.py src data/data.json index.html /dev/null
```

## データについて

- 出典：United Nations, DESA, Population Division. World Population Prospects 2024（CC BY 3.0 IGO）
  https://population.un.org/wpp/
- 取得元：Rパッケージ wpp2024（https://github.com/PPgp/wpp2024）の1歳刻み・各年のデータ
- 時点：各年7月1日。パッケージの値は各年12月31日時点なので、前年末と当年末の平均で年央の値にしています。
  2025年の世界人口は8,231,613千人で、国連の公表値と一致します。
- 2025年以降は中位推計です。
- 年齢は 0〜14歳、15〜64歳、65歳以上の3区分に集計しています。
- 所得グループは、同データが採用する世界銀行の分類を、すべての年に当てはめています。過去や将来の所得水準を表すものではありません。
  分類のない国・地域（ベネズエラなど）は「分類なし」としています。
- 1000個への割り当ては、地域×年齢×所得の90区分を最大剰余法で丸めています。各グループの人数には1人程度のずれが出ます。

## 公開

- 公開URL：https://world-as-1000-people.structure-and-representation.com/
- GitHub Pages（`main` ブランチのルート）で公開します。独自ドメインは `CNAME` ファイルで指定しています。
- リポジトリのライセンス（コード部分）は未設定です。
