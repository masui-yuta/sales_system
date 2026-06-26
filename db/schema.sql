-- 営業CRM用スキーマ（MySQL / MariaDB・XAMPP想定）
-- phpMyAdmin かコマンドラインで実行してください:
--   mysql -u root < db/schema.sql

CREATE DATABASE IF NOT EXISTS sales_system
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE sales_system;

-- 企業マスタ（初期データは国税庁法人番号データから投入）
CREATE TABLE IF NOT EXISTS companies (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  corporate_number CHAR(13)     NOT NULL UNIQUE,           -- 法人番号
  name             VARCHAR(255) NOT NULL,                  -- 社名
  prefecture       VARCHAR(20)  NOT NULL,                  -- 都道府県
  city             VARCHAR(50)  NOT NULL,                  -- 市区町村
  address          VARCHAR(255) NOT NULL,                  -- 本社住所（都道府県+市区町村+丁目番地）
  post_code        VARCHAR(8)   NULL,                      -- 郵便番号
  phone            VARCHAR(20)  NULL,                      -- 電話番号（補完対象）
  phone_source     VARCHAR(30)  NULL,                      -- 電話番号の出所（osm / manual 等）
  industry         VARCHAR(255) NULL,                      -- 業種（日本標準産業分類コード+名称 / 手動）
  capital_yen      BIGINT UNSIGNED NULL,                  -- 資本金（円・gBizINFO）
  employee_count   INT UNSIGNED NULL,                     -- 従業員数（gBizINFO）
  website_url      VARCHAR(512) NULL,                     -- 企業Webサイト（gBizINFO）
  recruit_url      VARCHAR(512) NULL,                     -- 採用ページURL（手動）
  source           VARCHAR(30)  NULL,                      -- データ出所（kokuzeicho / osm / manual / salesnow 等）
  note             TEXT         NULL,                      -- 担当者メモ
  call_count       INT UNSIGNED NOT NULL DEFAULT 0,       -- 架電回数（一覧高速化用・call_logs と同期）
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pref_city (prefecture, city),
  INDEX idx_pref_call_name (prefecture, call_count, name),
  INDEX idx_call_name_id (call_count, name, id),
  INDEX idx_pref_city_call (prefecture, city, call_count),
  INDEX idx_call_count (call_count),
  INDEX idx_industry (industry),
  INDEX idx_phone (phone)
) ENGINE=InnoDB;

-- 市区町村別件数（一覧の GROUP BY を避けるための集計テーブル）
CREATE TABLE IF NOT EXISTS city_stats (
  prefecture VARCHAR(20) NOT NULL,
  city       VARCHAR(50) NOT NULL,
  total      INT UNSIGNED NOT NULL DEFAULT 0,
  uncalled   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefecture, city),
  INDEX idx_pref_uncalled (prefecture, uncalled DESC)
) ENGINE=InnoDB;

-- ログイン用ユーザー（公開時は CLI で作成。自己登録は不可）
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  locked_until  DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- サーバー側セッション（ログアウト・失効管理）
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  CHAR(64)      NOT NULL PRIMARY KEY,
  user_id     BIGINT UNSIGNED NOT NULL,
  expires_at  DATETIME      NOT NULL,
  revoked_at  DATETIME      NULL,
  ip          VARCHAR(45)   NULL,
  user_agent  VARCHAR(255)  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB;

-- ログイン試行（ブルートフォース対策）
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255) NOT NULL,
  ip           VARCHAR(45)  NOT NULL,
  success      TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_time (email, attempted_at),
  INDEX idx_ip_time (ip, attempted_at)
) ENGINE=InnoDB;

-- 架電履歴（履歴が0件＝まだ架電していない企業）
CREATE TABLE IF NOT EXISTS call_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  BIGINT UNSIGNED NOT NULL,
  called_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result      VARCHAR(30)    NOT NULL,                     -- 不在 / 担当者不在 / アポ獲得 / 断り 等
  memo        TEXT           NULL,
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_call_logs_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_company (company_id),
  INDEX idx_called_at (called_at)
) ENGINE=InnoDB;
