# YouthCHPION 快取策略

## 原則

傳輸快取與資料新鮮度是兩件事。CloudFront 或瀏覽器命中 `/v1/dashboard`，不應把資料來源狀態
改成 `CACHED`；只有後端直接重用上游資料而沒有重新下載時，來源狀態才可標成 `CACHED`。任何
verification 都必須綁定原文 SHA-256、問題、模型、prompt 與 publication policy 版本。

目前使用 `AWS::Serverless::HttpApi`；HTTP API 沒有 REST API 的 stage cache，因此共用傳輸快取應放
在 CloudFront，或由應用程式實作 read-through cache。不要只為 API Gateway cache 改回 REST API。

參考：

- [AWS API Gateway HTTP API 與 REST API 比較](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-vs-rest.html)
- [CloudFront cache policy 與 cache key](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cache-key-understand-cache-policy.html)
- [CloudFront stale-while-revalidate / stale-if-error](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Expiration.html)
- [RFC 9111 HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html)
- [Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)

## 已實作的安全邊界

| Response | Cache-Control | 理由 |
|---|---|---|
| `/assets/<content-hash>.js|css` | `public, max-age=31536000, immutable` | Vite 檔名隨內容改變 |
| `/`, `index.html` | `no-cache` | 每次部署要重驗，避免舊 HTML 指向不存在的 chunk |
| `/v1/dashboard`、`/v1/occupations/*` | `max-age=0, s-maxage=60, stale-while-revalidate=300` | browser 重驗；未來 CDN 可共用 60 秒 |
| `/v1/dashboard/{run_id}` | `no-cache` + content-hash ETag | 儲存層尚未保證同一 run 只寫一次，必須重驗 |
| `/health`、`/ready`、`/v1/runs/*` | `no-store` | 狀態會變，不能沿用 |
| 所有 POST、4xx、5xx | `no-store` | 不快取 mutation、Agent 結果或錯誤 |

最新 dashboard 帶 `ETag: "dashboard-{analysis_run_id}-{live|stale}"`，支援 `If-None-Match`
回 304。狀態也放進 ETag，避免同一 run 從 `LIVE` 轉為 `STALE` 時誤回 304。超過
`LATEST_MAX_STALE_HOURS` 的快照會回 `STALE` 並改成 `no-cache`。

版本 dashboard 的 ETag 另含 canonical response SHA-256 前綴。現有 pipeline 對同一 `run_id`
仍可能被重送，因此不宣告 immutable；要先在 S3/DynamoDB 加 conditional write 與 terminal-run
guard，並通過 concurrency regression，才可升級為一年 immutable。

## 建議的應用層快取

### 1. 上游資料

| Source | Fresh TTL | stale-if-error 上限 | 建議 key |
|---|---:|---:|---|
| DGBAS 年度 workbook | 7 天 | 180 天 | canonical URL + parser version |
| ILO 版本化 CSV | 30 天 | 180 天 | dataset version + parser version |
| TaiwanJobs 職缺 | 6 小時 | 24 小時 | query/count + parser version |
| 104 搜尋與文章 | 24 小時 | 7 天 | normalized query / post id |
| OpenAlex、Crossref | 24 小時 | 7 天 | provider + normalized query + limit + parser version |

應新增 `source-cache/` prefix；`raw/`、`normalized/` 是不可覆寫的稽核紀錄，不是 cache。HTTP client
要保留上游 `ETag` 與 `Last-Modified`，到期後用 conditional GET 重驗。失敗時只有在 stale 上限內才
能回退，而且 UI 必須顯示 `STALE`，不得更新 `retrieved_at` 或宣稱 `LIVE`。

### 2. 原文與 passages

```text
documents/v1/{canonical_url_hash}/pointer.json
documents/v1/{canonical_url_hash}/{content_sha256}.bin
passages/{content_sha256}/{extractor_version}.json
```

URL pointer 短期快取；raw content 與 deterministic passages 以內容定址，可長期重用。原始全文只放
私有 bucket，並依授權條款設定 retention，不能送到公開 CDN。

### 3. Bedrock verification

只有完整通過模型 contract 與 publication gate 的結果可以進 positive cache。建議 key：

```text
sha256(
  normalized_question
  + evidence_id
  + canonical_final_url
  + document_content_sha256
  + passages_sha256
  + prompt_version
  + model_id/model_revision
  + source_policy_version
  + publication_schema_version
)
```

建議 TTL 7–30 天；任何 key 組件改變即 miss。timeout、throttling、無效 JSON、unsupported verdict、
redirect policy rejection 都不得寫 positive cache。Bedrock prompt caching只降低重複前綴的推論成本，
不等於可以重用認證 verdict。

### 4. Policy options

目前成功結果寫到 `published/{run_id}/policy-options/{occupation_code}-{request_hash}.json`，已避免同一
run 的不同職業、goal、evidence 與 verification 互相覆寫。若要把它升級成 read-through cache，key 還要
加入 verified claim content hash、policy prompt version 與 model revision。只可重用通過「剛好三個
選項」contract 的成功結果。

## CloudFront 導入順序

1. 先把 `/assets/*` 放到 CloudFront，使用 Vite content hash 與一年 immutable TTL。
2. 對 `/v1/dashboard` 使用 MinTTL 0、DefaultTTL 60、MaxTTL 300；錯誤回應 TTL 設 0。
3. 其餘 `/v1/*`、health、ready 與 HTML 使用 caching disabled。
4. 觀測 cache hit ratio、Lambda invocation、dashboard Age/ETag 和舊資料回報後，再導入上游 read-through cache。

`force_live=true` 在 application cache 上線前必須真的 bypass 上游 cache；目前前端送出此欄位，後端尚未
實作 read-through cache，因此仍代表每次查 OpenAlex/Crossref。未來不能忽略這個旗標後又顯示「即時」。
