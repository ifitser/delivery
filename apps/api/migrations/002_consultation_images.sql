-- Fase 2: fotos enviadas como alternativas en las consultas del comprador.
-- Conservamos el vínculo con el artículo para que el administrador también vea la foto.
ALTER TABLE attachments ADD COLUMN consultation_id INTEGER REFERENCES consultations(id) ON DELETE CASCADE;
CREATE INDEX idx_attachments_consultation ON attachments(consultation_id);
CREATE INDEX idx_consultations_item_status ON consultations(item_id, status);
