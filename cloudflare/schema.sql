CREATE TABLE pl2_properties (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  offer TEXT NOT NULL CHECK(offer IN ('rent','sale')),
  property_type TEXT NOT NULL CHECK(property_type IN ('Condo','Villa','House','Apartment','Land','Commercial')),
  location TEXT NOT NULL CHECK(length(location) BETWEEN 1 AND 100),
  price REAL NOT NULL CHECK(price > 0 AND price <= 1000000000000),
  price_period TEXT NOT NULL CHECK(price_period IN ('month','day','total')),
  bedrooms INTEGER NOT NULL DEFAULT 0 CHECK(bedrooms BETWEEN 0 AND 50),
  bathrooms INTEGER NOT NULL DEFAULT 0 CHECK(bathrooms BETWEEN 0 AND 50),
  size_sqm REAL CHECK(size_sqm > 0),
  features TEXT NOT NULL DEFAULT '[]' CHECK(json_type(features)='array'),
  description TEXT NOT NULL CHECK(length(description) BETWEEN 1 AND 5000),
  image_paths TEXT NOT NULL DEFAULT '[]' CHECK(json_type(image_paths)='array' AND json_array_length(image_paths)<=10),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  details TEXT NOT NULL DEFAULT '{}' CHECK(json_type(details)='object'),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  video_path TEXT
);
CREATE INDEX pl2_published_search ON pl2_properties(offer,location,property_type,price) WHERE status='published';
CREATE INDEX pl2_created ON pl2_properties(created_at DESC,id);
CREATE TABLE pl2_property_contacts (
  property_id TEXT PRIMARY KEY NOT NULL REFERENCES pl2_properties(id) ON DELETE CASCADE,
  name TEXT CHECK(length(name) BETWEEN 1 AND 100),
  email TEXT CHECK(length(email) BETWEEN 3 AND 254),
  phone TEXT CHECK(length(phone) BETWEEN 1 AND 40)
);
CREATE TABLE pl2_admins (user_id TEXT PRIMARY KEY NOT NULL);
CREATE TABLE pl2_admin_identities (
  email TEXT PRIMARY KEY NOT NULL COLLATE NOCASE,
  user_id TEXT NOT NULL UNIQUE REFERENCES pl2_admins(user_id) ON DELETE CASCADE
);
CREATE TABLE pl2_messages (
  id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  email TEXT NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 5000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  is_read INTEGER NOT NULL DEFAULT 0 CHECK(is_read IN (0,1))
);
CREATE TABLE pl2_rate_events (
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX pl2_rate_time ON pl2_rate_events(created_at);
CREATE TABLE video_uploads (path TEXT PRIMARY KEY NOT NULL, upload_id TEXT NOT NULL, bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 100000000));
