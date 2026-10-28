export const MAX_PROJECT_FILE_BYTES = 500 * 1024 * 1024;
export const PROJECT_FILE_SIZE_LABEL = "500 MB";
export const RESUMABLE_UPLOAD_THRESHOLD = 6 * 1024 * 1024;

export function projectFileSizeError(size: number): string | null {
  return size > MAX_PROJECT_FILE_BYTES ? `Choose a file no larger than ${PROJECT_FILE_SIZE_LABEL}.` : null;
}

export function storageUploadEndpoint(projectUrl: string) {
  const url = new URL(projectUrl);
  if (url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".storage.supabase.co")) {
    url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  }
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function uploadLargeProjectFile(file: File, objectName: string, accessToken: string,
  onProgress: (percent: number) => void) {
  const sizeError = projectFileSizeError(file.size);
  if (sizeError) throw new Error(sizeError);
  const { Upload } = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: storageUploadEndpoint(process.env.NEXT_PUBLIC_SUPABASE_URL!),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${accessToken}`, "x-upsert": "false" },
      chunkSize: RESUMABLE_UPLOAD_THRESHOLD,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      storeFingerprintForResuming: false,
      metadata: { bucketName: "project-documents", objectName, contentType: file.type || "application/octet-stream", cacheControl: "3600" },
      onProgress: (uploaded, total) => onProgress(total ? Math.min(100, Math.floor(uploaded / total * 100)) : 0),
      onError: () => reject(new Error("The upload could not finish after retrying. Check your connection and try again.")),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}
