-- The original drawing set stays intact; client and worker enforce the same cap.
update storage.buckets set file_size_limit = 524288000 where id = 'project-documents';
