-- اسکیمای D1 برای شکرستان
-- یک جدول عمومی که دقیقاً رفتار Firestore (collection/docId -> فیلدها) رو تقلید می‌کنه،
-- تا worker.js و index.html اصلاً نیازی نداشته باشن بفهمن پشت صحنه چی عوض شده.
-- مسیر کالکشن می‌تونه تودرتو هم باشه، دقیقاً مثل Firestore
-- (مثلاً 'taskDeliveries/task123/threads/uid456/messages').

CREATE TABLE IF NOT EXISTS fs_documents (
  collection    TEXT NOT NULL,
  doc_id        TEXT NOT NULL,
  data          TEXT NOT NULL,             -- کل فیلدهای سند، به‌صورت JSON
  created_at_ms INTEGER NOT NULL DEFAULT 0, -- کپی از data.createdAtMs، فقط برای مرتب‌سازی سریع پیش‌فرض
  PRIMARY KEY (collection, doc_id)
);

-- برای poll هایی که orderByField نمی‌فرستن (مرتب‌سازی پیش‌فرض بر اساس زمان ساخت)
CREATE INDEX IF NOT EXISTS idx_fs_documents_collection_created
  ON fs_documents (collection, created_at_ms);
