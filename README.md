# 住まいのFPシミュレーター Pro

住宅営業（アイ工務店）向け、商談時にお客様と一緒に見るための FP シミュレーター。
React + TypeScript + Tailwind + Recharts。

---

## 🚀 別のPCで使うには（クローン手順）

### 1. Node.js をインストール

[Node.js 公式](https://nodejs.org/) から **LTS 版** をダウンロードしてインストール。
インストール後、PowerShell で確認:

```powershell
node -v   # v20.x.x のように出れば OK
npm -v
```

### 2. このリポジトリをクローン

```powershell
cd C:\Users\<ユーザー名>\Desktop
git clone https://github.com/<your-username>/fp-simulator.git
cd fp-simulator
```

### 3. 依存パッケージをインストール（数分）

```powershell
npm install
```

### 4. 起動

```powershell
npm run dev
```

ブラウザで自動的に `http://localhost:5173` が開きます。

---

## 💾 顧客データの取り扱い

- 入力した顧客データは **ブラウザの localStorage（そのPC・そのブラウザに紐づく）** に自動保存されます
- **別PC・別ブラウザに移動した場合、顧客データは引き継がれません**（PDF印刷した提案書を別途保管してください）
- 必要に応じて Supabase 連携で複数PC同期も可能（下記）

---

## 開発コマンド

```powershell
npm run dev       # 開発サーバー起動（http://localhost:5173）
npm run build     # 本番ビルド（dist/ 配下に出力）
npm run preview   # ビルド済みファイルのプレビュー
```

## Supabase 連携（任意・複数PC間でデータ同期したい場合のみ）

`.env.example` をコピーして `.env.local` を作成し、以下を設定:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

未設定でも localStorage に保存されるため動作します（ヘッダーに「💾 ローカル保存」と表示）。

### Supabase テーブル

```sql
create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);
```

---

## 構成

```
src/
  components/
    tabs/
      BasicInfo.tsx     基本情報（世帯主・配偶者・子・貯蓄）
      HousingPlan.tsx   住宅資金計画
      LoanPlan.tsx      ローン計画（3期金利・繰上返済・住宅ローン控除）
      SolarBattery.tsx  太陽光・蓄電池（FIT前後・自家消費率）
      Maintenance.tsx   メンテナンス（周期×費用）
      Lcc.tsx           LCC（生活費・光熱費・教育費・急な出費・貯蓄型保険）
      Summary.tsx       総合まとめ（年次推移表・グラフ・ライフイベント）
    Header.tsx          ヘッダー（タブ + 期間切替 + 顧客操作）
    PrintProposal.tsx   印刷用提案書（3ページ構成）
    ui.tsx              共通UI（NumInput は min=0 デフォルト・負値禁止）
  hooks/
    useCalculations.ts  全計算ロジック（必ず60年分計算）
    useCustomer.ts      顧客の保存・呼び出し（Supabase or localStorage）
  lib/
    supabase.ts         Supabase クライアント
    defaults.ts         初期値・メンテ項目テンプレート
    format.ts           数値フォーマッタ
  types/index.ts        全型定義
  App.tsx
  main.tsx
```

## 計算ロジック概要

- **収入**: 年収 × 昇給率の現実カーブ（〜50ピーク / 55〜59 −3%/年 / 60再雇用 ×0.65 / 61〜 −1%/年）+ ボーナス + 配偶者収入 / 退職金 / 年金（基礎+厚生）
- **ローン**: 元利均等・3期金利切替・ボーナス払い・繰上返済対応（残高は月単位で正確に追跡）
- **住宅ローン控除**: 年末残高×0.7%（長期優良5000万13年 / ZEH4500万13年 / 一般3000万10年）/ ペアローン按分対応
- **固定資産税**: 出雲市概算（固定資産税1.5% + 都市計画税0.075%）/ 建物は120㎡相当まで新築軽減 / 土地は200㎡以下と超過分を住宅用地特例で按分
- **太陽光**: 月別発電量×自家消費＆売電（FIT前後で単価切替）× メンテ/パワコン/蓄電池交換
- **教育費**: 公私立切替 × 仕送り（小〜大学）
- **メンテ**: 項目別 周期×費用（外壁・屋根・給湯器・キッチン等）
- **急な出費**: フリー入力した周期支出（車買い替えなど）
- **貯蓄型保険**: 月々払込（支出）+ 満期受取（収入）
- **年金**: 年金開始年齢から開始（定年と分離可能）

## 印刷

ヘッダー「📄 提案書印刷」→ A4縦 **3ページ構成** の提案書がブラウザの印刷ダイアログで開きます。

- **Page 1**: 顧客情報・住宅プラン・月返済（1期/2期/3期）・資産残高グラフ・推奨貯蓄プラン・繰上返済プラン
- **Page 2**: キャッシュフロー（年次推移・1年刻み）
- **Page 3**: ライフイベント一覧（全件）

---

## トラブルシューティング

- **`npm install` でエラー**: Node.js のバージョンを確認（推奨 v20 LTS）
- **ポート 5173 が使用中**: 他のアプリが使っている可能性。`npm run dev -- --port 5174` で別ポート起動
- **画面が真っ白**: ブラウザの DevTools（F12）→ Console タブのエラーを確認
- **localStorage の顧客データを初期化したい**: F12 → Console で `localStorage.clear()` 実行 → リロード
