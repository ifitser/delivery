CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','buyer','customer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL, phone TEXT UNIQUE, notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE shopping_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store TEXT NOT NULL CHECK(store IN ('costco','sams')),
  purchase_date TEXT NOT NULL, cutoff_at TEXT NOT NULL,
  buyer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'programada'
    CHECK(status IN ('programada','en_curso','finalizada','cancelada')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  shopping_day_id INTEGER NOT NULL REFERENCES shopping_days(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','whatsapp','web')),
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK(status IN ('borrador','pendiente_revision','confirmado','en_compra','finalizado','cancelado')),
  notes TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
  purchased_quantity INTEGER NOT NULL DEFAULT 0 CHECK(purchased_quantity >= 0),
  price_cents INTEGER CHECK(price_cents >= 0), product_url TEXT, notes TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK(status IN ('pendiente','en_busqueda','en_consulta','comprado','no_disponible')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE inbound_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT NOT NULL DEFAULT 'whatsapp', body TEXT, received_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES inbound_messages(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL, mime_type TEXT NOT NULL, original_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(order_item_id IS NOT NULL OR message_id IS NOT NULL)
);
CREATE TABLE consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  question TEXT NOT NULL, alternative_description TEXT,
  estimated_price_cents INTEGER CHECK(estimated_price_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK(status IN ('pendiente','aceptada','rechazada','sin_respuesta')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE consultation_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consultation_id INTEGER NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  response TEXT NOT NULL,
  decision TEXT CHECK(decision IN ('aceptar','rechazar','pregunta')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_orders_day ON orders(shopping_day_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_days_buyer ON shopping_days(buyer_id);
CREATE INDEX idx_messages_customer ON inbound_messages(customer_id);
