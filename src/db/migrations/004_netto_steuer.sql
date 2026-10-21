-- Netto und Umsatzsteuer aus dem Rechnungs-PDF (W55) – nur gespeichert, wenn Netto + Steuer = Brutto
ALTER TABLE inbound_document
  ADD COLUMN netto      numeric(12, 2),
  ADD COLUMN ust_betrag numeric(12, 2),
  ADD COLUMN ust_satz   text;
