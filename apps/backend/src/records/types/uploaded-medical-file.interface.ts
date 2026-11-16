export interface UploadedMedicalFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname: string;
}
