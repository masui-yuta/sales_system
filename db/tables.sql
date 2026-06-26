-- クラウド DB 用テーブル定義（CREATE DATABASE なし）
-- TiDB Cloud 等ではコンソールで DB を作成してから実行

CREATE TABLE IF NOT EXISTS companies (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  corporate_number CHAR(13)     NOT NULL UNIQUE,
  name             VARCHAR(255) NOT NULL,
  prefecture       VARCHAR(20)  NOT NULL,
  city             VARCHAR(50)  NOT NULL,
  address          VARCHAR(255) NOT NULL,
  post_code        VARCHAR(8)   NULL,
  phone            VARCHAR(20)  NULL,
  phone_source     VARCHAR(30)  NULL,
  industry         VARCHAR(255) NULL,
  capital_yen      BIGINT UNSIGNED NULL,
  employee_count   INT UNSIGNED NULL,
  website_url      VARCHAR(512) NULL,
  recruit_url      VARCHAR(512) NULL,
  source           VARCHAR(30)  NULL,
  note             TEXT         NULL,
  call_count       INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_pref_city (prefecture, city),
  INDEX idx_pref_call_name (prefecture, call_count, name),
  INDEX idx_call_name_id (call_count, name, id),
  INDEX idx_pref_city_call (prefecture, city, call_count),
  INDEX idx_call_count (call_count),
  INDEX idx_industry (industry),
  INDEX idx_phone (phone)
);

CREATE TABLE IF NOT EXISTS city_stats (
  prefecture VARCHAR(20) NOT NULL,
  city       VARCHAR(50) NOT NULL,
  total      INT UNSIGNED NOT NULL DEFAULT 0,
  uncalled   INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (prefecture, city),
  INDEX idx_pref_uncalled (prefecture, uncalled DESC)
);

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  locked_until  DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

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
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255) NOT NULL,
  ip           VARCHAR(45)  NOT NULL,
  success      TINYINT(1)   NOT NULL DEFAULT 0,
  attempted_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email_time (email, attempted_at),
  INDEX idx_ip_time (ip, attempted_at)
);

CREATE TABLE IF NOT EXISTS call_logs (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  company_id  BIGINT UNSIGNED NOT NULL,
  called_at   DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  result      VARCHAR(30)    NOT NULL,
  memo        TEXT           NULL,
  created_at  DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_call_logs_company
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_company (company_id),
  INDEX idx_called_at (called_at)
);
