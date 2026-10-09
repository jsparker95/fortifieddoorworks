import { supabase } from "./supabase";
export type DeletionJob = { id: string; target_name: string; paths: string[] };
export async function pendingDeletionFiles(): Promise<DeletionJob[]> {
  const { data, error } = await supabase.rpc("pending_deletion_files");
  if (error) throw error;
  return data || [];
}
/** Jobs remain in the database until Storage confirms that every file is gone. */
export async function cleanupDeletedFiles(jobs: DeletionJob[]) {
  for (const job of jobs) {
    for (let offset = 0; offset < job.paths.length; offset += 100) {
      const { error } = await supabase.storage.from("project-documents")
        .remove(job.paths.slice(offset, offset + 100));
      if (error) throw error;
    }
  }
  const remaining = await pendingDeletionFiles();
  if (remaining.some((job) => jobs.some((requested) => requested.id === job.id))) throw new Error("Some files remain. Retry file cleanup.");
}
