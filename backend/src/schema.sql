-- MariaDB Schema for Logistics KPI Management
-- Run this on your Synology NAS MariaDB

CREATE DATABASE IF NOT EXISTS logistics_kpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE logistics_kpi;

-- Deliveries table (main data)
CREATE TABLE IF NOT EXISTS deliveries (
  order_no VARCHAR(50) PRIMARY KEY,
  district VARCHAR(100),
  store_id VARCHAR(50),
  plan_date DATE,
  open_date DATE,
  actual_date DATE,
  qty DECIMAL(10,2) DEFAULT 0,
  sender VARCHAR(100),
  province VARCHAR(100),
  import_file_id VARCHAR(100),
  delivery_status VARCHAR(50),
  actual_datetime DATETIME,
  product_details TEXT,
  kpi_status ENUM('PASS', 'NOT_PASS') DEFAULT 'NOT_PASS',
  delay_days INT DEFAULT 0,
  reason_required TINYINT(1) DEFAULT 0,
  reason_status ENUM('NOT_REQUIRED', 'PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED') DEFAULT 'NOT_REQUIRED',
  delay_reason VARCHAR(255),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  weekday VARCHAR(20),
  document_returned TINYINT(1) DEFAULT 0,
  document_returned_date DATE,
  document_return_bill_date DATE,
  document_return_source ENUM('pdf', 'manual'),
  manual_plan_date TINYINT(1) DEFAULT 0,
  manual_actual_date TINYINT(1) DEFAULT 0,
  INDEX idx_plan_date (plan_date),
  INDEX idx_actual_date (actual_date),
  INDEX idx_sender (sender),
  INDEX idx_province (province),
  INDEX idx_kpi_status (kpi_status)
) ENGINE=InnoDB;

-- Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id VARCHAR(50) PRIMARY KEY,
  date DATE NOT NULL,
  name VARCHAR(255) NOT NULL,
  type ENUM('sunday', 'public', 'company', 'special') DEFAULT 'public',
  INDEX idx_date (date)
) ENGINE=InnoDB;

-- Store closures
CREATE TABLE IF NOT EXISTS store_closures (
  id VARCHAR(50) PRIMARY KEY,
  store_id VARCHAR(50) NOT NULL,
  date DATE,
  close_rule ENUM('every_sunday', 'every_saturday', 'every_weekend'),
  reason VARCHAR(255),
  INDEX idx_store_id (store_id),
  INDEX idx_date (date)
) ENGINE=InnoDB;

-- KPI Configs
CREATE TABLE IF NOT EXISTS kpi_configs (
  id VARCHAR(50) PRIMARY KEY,
  branch VARCHAR(100),
  province VARCHAR(100),
  district VARCHAR(100) NOT NULL,
  on_time_limit INT DEFAULT 3,
  is_draft TINYINT(1) DEFAULT 0,
  INDEX idx_district (district)
) ENGINE=InnoDB;

-- Delay reasons
CREATE TABLE IF NOT EXISTS delay_reasons (
  code VARCHAR(50) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  category ENUM('internal', 'external') DEFAULT 'internal'
) ENGINE=InnoDB;

-- Import logs
CREATE TABLE IF NOT EXISTS import_logs (
  id VARCHAR(50) PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  file_name VARCHAR(255),
  user_id VARCHAR(50),
  user_name VARCHAR(100),
  records_processed INT DEFAULT 0,
  created INT DEFAULT 0,
  updated INT DEFAULT 0,
  skipped INT DEFAULT 0,
  errors INT DEFAULT 0,
  error_details JSON,
  skipped_details JSON,
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB;

-- Reason audit logs
CREATE TABLE IF NOT EXISTS reason_audit_logs (
  id VARCHAR(50) PRIMARY KEY,
  timestamp DATETIME NOT NULL,
  order_no VARCHAR(50),
  action ENUM('submitted', 'approved', 'rejected'),
  user_id VARCHAR(50),
  user_name VARCHAR(100),
  reason VARCHAR(255),
  comment TEXT,
  INDEX idx_order_no (order_no),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB;

-- Import logs
CREATE TABLE IF NOT EXISTS import_logs (
  id VARCHAR(100) PRIMARY KEY,
  timestamp VARCHAR(50),
  file_name VARCHAR(500),
  user_id VARCHAR(100),
  user_name VARCHAR(200),
  records_processed INT DEFAULT 0,
  created INT DEFAULT 0,
  updated INT DEFAULT 0,
  skipped INT DEFAULT 0,
  errors INT DEFAULT 0,
  error_details TEXT,
  skipped_details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Store mappings
CREATE TABLE IF NOT EXISTS store_mappings (
  store_id VARCHAR(255) PRIMARY KEY,
  district VARCHAR(100),
  province VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Branch resources
CREATE TABLE IF NOT EXISTS branch_resources (
  id VARCHAR(50) PRIMARY KEY,
  branch_name VARCHAR(100) NOT NULL,
  trucks INT DEFAULT 0,
  trips_per_day INT DEFAULT 0,
  loaders INT DEFAULT 0,
  checkers INT DEFAULT 0,
  admin INT DEFAULT 0,
  work_hours_per_day DECIMAL(4,2) DEFAULT 8,
  loader_wage DECIMAL(10,2) DEFAULT 0,
  checker_wage DECIMAL(10,2) DEFAULT 0,
  admin_wage DECIMAL(10,2) DEFAULT 0,
  truck_cost_per_day DECIMAL(10,2) DEFAULT 0,
  calculated_capacity DECIMAL(10,2),
  calculated_speed DECIMAL(10,2),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  updated_by VARCHAR(100),
  INDEX idx_branch_name (branch_name)
) ENGINE=InnoDB;

-- Branch resource history
CREATE TABLE IF NOT EXISTS branch_resource_history (
  id VARCHAR(50) PRIMARY KEY,
  branch_id VARCHAR(50),
  action ENUM('create', 'update'),
  changes JSON,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by VARCHAR(100),
  INDEX idx_branch_id (branch_id)
) ENGINE=InnoDB;

-- Create API user (run as root)
-- CREATE USER 'logistics_api'@'%' IDENTIFIED BY 'your_secure_password';
-- GRANT ALL PRIVILEGES ON logistics_kpi.* TO 'logistics_api'@'%';
-- FLUSH PRIVILEGES;
