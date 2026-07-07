-- Change the vector dimension to match the 768 dimensions produced by the Nomic embed text model (instead of OpenAI's 1536)
ALTER TABLE compliance_task ALTER COLUMN embedding TYPE vector(768);
