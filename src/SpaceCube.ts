import fs from "fs";
import path from "path";
import mime from "mime-types";
import * as S3SDK from "@aws-sdk/client-s3";

type Creds = {
    s3_endpoint: string;
    s3_region: string;
    s3_access_key: string;
    s3_secret_key: string;
};

type Res = {
    rc: number;
    data?: any;
    err?: any;
};

type UploadOptions = {
    bucket: string;
    localPath: string;
    remotePath: string;
    publicAccess?: boolean;
    recursive?: boolean;
    mimeTypeOverride?: string;
    verbose?: boolean;
}

type DeleteOptions = {
    bucket: string;
    remotePath: string;
    recursive?: boolean;
    verbose?: boolean;
}

type ListOptions = {
    bucket: string;
    remotePath?: string; // Filter by path
}

type DownloadOptions = {
    bucket: string;
    remotePath: string;
    localPath: string;
    recursive?: boolean;
    verbose?: boolean;
}

type GetOptions = {
    bucket: string;
    remotePath: string;
}

type PutOptions = {
    bucket: string;
    remotePath: string;
    data: string | Buffer | Uint8Array;
    publicAccess?: boolean;
    mimeTypeOverride?: string;
}

class Cube {
    private s3Client: S3SDK.S3;

    constructor(creds: Creds) {
        this.s3Client = new S3SDK.S3({
            forcePathStyle: false,
            endpoint: creds.s3_endpoint === "" ? undefined : creds.s3_endpoint,
            region:creds.s3_region,
            credentials: {
                accessKeyId: creds.s3_access_key,
                secretAccessKey: creds.s3_secret_key
            }
        });
    }
    //
    // Buckets
    //
    public async createBucket(bucket: string): Promise<Res> {
        let out: Res = {rc: 0};
        const params = {
            Bucket: bucket
        };
        await this.s3Client.send(new S3SDK.CreateBucketCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        return out;
    }

    public async deleteBucket(bucket: string): Promise<Res> {
        let out: Res = {rc: 0};
        const params = {
            Bucket: bucket
        };
        await this.s3Client.send(new S3SDK.DeleteBucketCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        return out;
    }

    async listBuckets(): Promise<Res> {
        let out: Res = {rc: 0};
        const data = await this.s3Client.send(new S3SDK.ListBucketsCommand({}))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        if (out.rc !== 0) return out;
        if (!data) {
            out.rc = 1;
            return out;
        }
        out.data = data.Buckets ? data.Buckets.map((bucket) => bucket.Name || '') : [];
        return out;
    }

    //
    // List
    //
    async list(opt: ListOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const res = await this.s3Client.send(new S3SDK.ListObjectsV2Command({
            Bucket: opt.bucket,
            Prefix: opt.remotePath
        }))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        if (out.rc !== 0) return out;
        if (!res || !res.Contents) {
            out.rc = 1;
            out.err = "No contents";
            return out;
        }
        out.data = res.Contents;
        return out;
    }

    //
    // Uploads
    //
    public async upload(opt: UploadOptions): Promise<Res> {
        if (opt.recursive) {
            return await this.uploadDirectory(opt);
        }
        return await this.uploadFile(opt);
    }

    private async uploadFile(opt: UploadOptions): Promise<Res> {
        let out: Res = {rc: 0};
        // Check that the upload target exists
        if (!fs.existsSync(opt.localPath)) {
            out.rc = 1;
            out.err = "localPath does not exist";
            return out;
        }
        // Check if the localPath is a directory
        if (!fs.statSync(opt.localPath).isFile()) {
            out.rc = 1;
            out.err = "localPath is not a file (use recursive option to upload a directory)';";
            return out;
        }
        const data = fs.readFileSync(opt.localPath);
        const ext = opt.remotePath.split(".").pop() || "";
        const mimetype = opt.mimeTypeOverride || mime.lookup(ext) || "application/octet-stream";
        const size = data.length;
        const params = {
            Bucket: opt.bucket,
            Key: opt.remotePath,
            Body: data,
            ContentType: mimetype,
            ContentLength: size,
            ACL: opt.publicAccess ? "public-read" as S3SDK.ObjectCannedACL : undefined
        };
        if (opt.verbose) console.log(`Uploading ${opt.remotePath}`);
        await this.s3Client.send(new S3SDK.PutObjectCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        return out;
    }

    private async uploadDirectory(opt: UploadOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const dir = opt.localPath;
        const list = fs.readdirSync(dir);
        for (const item of list) {
            const localPath = path.join(dir, item);
            const remotePath = path.join(opt.remotePath, item);
            if (fs.statSync(localPath).isDirectory()) {
                const newOpt: UploadOptions = {
                    ...opt,
                    localPath,
                    remotePath
                };
                await this.uploadDirectory(newOpt)
                .catch((err) => {
                    out.rc = 1;
                    out.err = err;
                });
                if (out.rc !== 0) return out;
            }
            else {
                const newOpt: UploadOptions = {
                    ...opt,
                    localPath,
                    remotePath
                };
                await this.uploadFile(newOpt)
                .catch((err) => {
                    out.rc = 1;
                    out.err = err;
                });
                if (out.rc !== 0) return out;
            }
        }
        return out;
    }

    //
    // Downloads
    //
    public async download(opt: DownloadOptions): Promise<Res> {
        if (opt.recursive) {
            return await this.downloadDirectory(opt);
        }
        return await this.downloadFile(opt);
    }

    private async downloadFile(opt: DownloadOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const getOpt: GetOptions = {
            bucket: opt.bucket,
            remotePath: opt.remotePath
        };
        if (opt.verbose) console.log(`Downloading ${opt.remotePath} to ${opt.localPath}`);
        const res = await this.get(getOpt)
        .catch((err) => {
            out.rc = 1;
            out.err = err;
            return out;
        });
        if (out.rc !== 0) return out;
        if (res.rc !== 0) {
            out.rc = 1;
            return out;
        }
        if (res.data) {
            // Ensure the write path is a file
            if (fs.existsSync(opt.localPath) && fs.statSync(opt.localPath).isDirectory()) {
                out.rc = 1;
                out.err = "localPath expected file got directory";
                return out;
            }
            // Ensure we are writing to a directory
            if (fs.existsSync(path.dirname(opt.localPath)) && !fs.statSync(path.dirname(opt.localPath)).isDirectory()) {
                out.rc = 1;
                out.err = "localPath expected directory got file";
                return out;
            }
            // Ensure the write path exists
            if (!fs.existsSync(path.dirname(opt.localPath))) {
                fs.mkdirSync(path.dirname(opt.localPath), { recursive: true });
            }
            fs.writeFileSync(opt.localPath, res.data);
            return out;
        }
        out.rc = 1;
        return out;
    }

    private async downloadDirectory(opt: DownloadOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const optList: ListOptions = {
            bucket: opt.bucket,
            remotePath: opt.remotePath
        };
        const res = await this.list(optList)
        .catch((err) => {
            out.rc = 1;
            out.err = err;
            return out;
        });
        if (out.rc !== 0) return out;
        if (!res.data) {
            out.rc = 1;
            out.err = "No contents";
            return out;
        }
        for (const item of res.data) {
            if (item.Key && item.Key.endsWith("/")) continue;
            const writePath = opt.localPath + item.Key?.replace(opt.remotePath, '');
            if (item.Key) {
                const dlOpt: DownloadOptions = {
                    bucket: opt.bucket,
                    remotePath: item.Key,
                    localPath: writePath,
                    verbose: opt.verbose
                };
                const res = await this.download(dlOpt)
                .catch((err) => {
                    out.rc = 1;
                    out.err = err;
                    return out;
                });
                if (out.rc !== 0) return out;
                if (res.rc !== 0) {
                    out.rc = 1;
                    out.err = res.err;
                    return out;
                }
            }
        }
        return out;
    }

    //
    // Delete
    //
    public async delete(opt: DeleteOptions): Promise<Res> {
        if (opt.recursive) {
            return await this.deleteDirectory(opt);
        }
        return await this.deleteFile(opt);
    }

    private async deleteFile(opt: DeleteOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const params = {
            Bucket: opt.bucket,
            Key: opt.remotePath
        };
        if (opt.verbose) console.log(`Deleting ${opt.remotePath}`);
        await this.s3Client.send(new S3SDK.DeleteObjectCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        return out;
    }

    private async deleteDirectory(opt: DeleteOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const res = await this.s3Client.send(new S3SDK.ListObjectsV2Command({
            Bucket: opt.bucket,
            Prefix: opt.remotePath
        }))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        if (out.rc !== 0) return out;
        if (!res) {
            out.rc = 1;
            return out;
        }
        if (res.Contents) {
            for (const item of res.Contents) {
                if (item.Key) {
                    opt.remotePath = item.Key;
                    await this.deleteFile(opt)
                    .catch((err) => {
                        out.rc = 1;
                        out.err = err;
                    });
                    if (out.rc !== 0) return out;
                }
            }
        }
        return out;
    }
    //
    // Get/Put
    //
    public async get(opt: GetOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const params = {
            Bucket: opt.bucket,
            Key: opt.remotePath
        };
        const res = await this.s3Client.send(new S3SDK.GetObjectCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        if (out.rc !== 0) return out;
        if (!res || !res.Body) {
            out.rc = 1;
            return out;
        }
        const body = await this.streamToBuffer(res.Body)
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        if (out.rc !== 0) return out;
        out.data = body;
        return out;
    }

    public async put(opt: PutOptions): Promise<Res> {
        let out: Res = {rc: 0};
        const ext = opt.remotePath.split(".").pop() || "";
        const mimetype = opt.mimeTypeOverride || mime.lookup(ext) || "application/octet-stream";
        const params = {
            Bucket: opt.bucket,
            Key: opt.remotePath,
            Body: opt.data,
            ContentType: mimetype,
            ACL: opt.publicAccess ? "public-read" as S3SDK.ObjectCannedACL : undefined
        };
        await this.s3Client.send(new S3SDK.PutObjectCommand(params))
        .catch((err) => {
            out.rc = 1;
            out.err = err;
        });
        return out;
    }
    //
    // Utility
    //
    private streamToBuffer = async (stream: any): Promise<Buffer> => {
        return new Promise((resolve, reject) => {
            const chunks: Uint8Array[] = [];
            stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
            stream.on("end", () => resolve(Buffer.concat(chunks)));
            stream.on("error", reject);
        });
    };
}

export {
    Cube, 
    Creds,
    Res,
    UploadOptions,
    DeleteOptions,
    ListOptions,
    DownloadOptions,
    GetOptions,
    PutOptions
};
