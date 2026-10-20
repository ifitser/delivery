-- Fase 3: bandeja de WhatsApp. La captura no crea pedidos sin revisión.
ALTER TABLE inbound_messages ADD COLUMN remote_jid TEXT;
ALTER TABLE inbound_messages ADD COLUMN sender_phone TEXT;
ALTER TABLE inbound_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'text';
ALTER TABLE inbound_messages ADD COLUMN order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;
CREATE INDEX idx_inbound_status_date ON inbound_messages(status, received_at);
CREATE INDEX idx_inbound_phone ON inbound_messages(sender_phone);
