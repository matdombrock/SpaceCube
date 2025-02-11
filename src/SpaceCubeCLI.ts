#! /usr/bin/env node
import fs from "fs";
import path from "path";
import ReadLine from "readline";
import { Command } from "commander";
import * as SpaceCube from "./SpaceCube.js";

class SpaceCubeCLI {
    private defaultCredsPath = '~/.spacecube.json';
    public run() {
        this.defaultCredsPath = this.magicPath(this.defaultCredsPath);
        const program = new Command();
        program
            .name("spacecube")
            .version("0.1.0")
            .description("SpaceCube CLI \nMathieu Dombrock - GPL3");

        program
            .command("auth")
            .description("create a credentials file")
            .option("-a, --accessKey <accessKey>", "S3 Access Key", "yourAccessKeyId")
            .option("-s, --secretKey <secretKey>", "S3 Secret Key", "yourSecretKey")
            .option("-e, --endpoint <endpoint>", "Endpoint", "https://s3.amazonaws.com")
            .option("-r, --region <region>", "Region", "us-east-1")
            .option("-o, --output <path>", "Output path for credentials file", this.defaultCredsPath)
            .action((options) => {
                const creds : SpaceCube.Creds = {
                    s3_endpoint: options.endpoint,
                    s3_access_key: options.accessKey,
                    s3_secret_key: options.secretKey,
                    s3_region: options.region
                };
                const outputPath = path.resolve(options.output);
                fs.writeFileSync(outputPath, JSON.stringify(creds, null, 2));
                console.log(`Credentials file created at ${outputPath}`);
                console.log('Use the -c flag when running commands to specify a creds path');
            });
        
        program
            .command("auth-wizard")
            .description("create a credentials file interactively")
            .action(() => {
                const creds : SpaceCube.Creds = {
                    s3_endpoint: '',
                    s3_access_key: '',
                    s3_secret_key: '',
                    s3_region: ''
                };
                const rl = ReadLine.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                rl.question('S3 Access Key: ', (accessKey) => {
                    creds.s3_access_key = accessKey;
                    rl.question('S3 Secret Key: ', (secretKey) => {
                        creds.s3_secret_key = secretKey;
                        rl.question('S3 Endpoint: ', (endpoint) => {
                            creds.s3_endpoint = endpoint;
                            rl.question('S3 Region: ', (region) => {
                                creds.s3_region = region;
                                const outputPath = path.resolve(this.defaultCredsPath);
                                fs.writeFileSync(outputPath, JSON.stringify(creds, null, 2));
                                console.log(creds);
                                console.log(`Credentials file created at ${outputPath}`);
                                rl.close();
                            });
                        });
                    });
                });
            });

        program
            .command("bucket-new")
            .description("create a new bucket")
            .argument("<bucket>", "Bucket name")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .action(async (bucket, options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const res = await spacecube.createBucket(bucket);
                if (res.rc !== 0) {
                    console.error('Cant create bucket');
                    console.error(res);
                    process.exit(1);
                }
                console.log(`Bucket ${bucket} created successfully`);
            });
        
        program
            .command("bucket-delete")
            .description("delete a bucket")
            .argument("<bucket>", "Bucket name")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .action(async (bucket, options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const res = await spacecube.deleteBucket(bucket);
                if (res.rc !== 0) {
                    console.error('Cant delete bucket');
                    console.error(res);
                    process.exit(1);
                }
                console.log(`Bucket ${bucket} deleted successfully`);
            });

        program
            .command("buckets")
            .description("list all buckets")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .action(async (options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const res = await spacecube.listBuckets();
                console.log(JSON.stringify(res.data, null, 2));
            });
        
        program
            .command("list")
            .description("list files")
            .argument("<bucket>", "Bucket name")
            .option("-c, --creds <localPath>", "Credentials path", this.defaultCredsPath)
            .option("-d, --dir <remotePath>", "Directory listing", '')
            .option("-r, --raw", "Do not stringify")
            .option("-a, --all", "Show all data")
            .action(async (bucket, options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const opt: SpaceCube.ListOptions = {
                    bucket,
                    remotePath: options.dir,
                };
                let res = await spacecube.list(opt);
                if (res.rc !== 0) {
                    console.error(`Cant list file from bucket ${bucket}`);
                    console.error(res);
                    process.exit(1);
                }
                if (!options.all) {
                    res.data = res.data.map((item) => item.Key);
                }
                if (!options.raw) {
                    console.log(JSON.stringify(res.data, null, 2));
                }
                else {
                    console.log(res.data);
                }
            });

        program
            .command("upload")
            .description("upload a file")
            .argument("<bucket>", "Bucket name")
            .argument("<localPath>", "Local file path")
            .argument("<remotePath>", "Remote ile name")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .option("-p, --public", "Make file public", true)
            .option("-r, --recursive", "Upload all files in a directory", false)
            .option("-m, --mime <type>", "Mime type override")
            .option("-v, --verbose", "Verbose output", false)
            .action(async (bucket, localPath, remotePath, options) => {
                if (remotePath === '.') {
                    remotePath = options.recursive ? '' : localPath;
                }
                localPath = this.magicPath(localPath);
                const spacecube = this.makeSpaceCube(options.creds);
                const opt: SpaceCube.UploadOptions = {
                    bucket,
                    localPath,
                    remotePath,
                    publicAccess: options.public,
                    recursive: options.recursive,
                    mimeTypeOverride: options.mime,
                    verbose: options.verbose
                };
                const res = await spacecube.upload(opt);
                if (res.rc !== 0) {
                    console.error('Cant complete upload');
                    console.error(res);
                    process.exit(1);
                }
            });

        program
            .command("download")
            .description("download a file")
            .argument("<bucket>", "Bucket name")
            .argument("<remotePath>", "Remote file path")
            .argument("<localPath>", "Local file path")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .option("-r, --recursive", "Download all files in a directory", false)
            .option("-v, --verbose", "Verbose output", false)
            .action(async (bucket, remotePath, localPath, options) => {
                if (localPath === '.') {
                    localPath += remotePath;
                }
                localPath = this.magicPath(localPath);
                const opt: SpaceCube.DownloadOptions = {
                    bucket,
                    remotePath,
                    localPath,
                    recursive: options.recursive,
                    verbose: options.verbose
                };
                const spacecube = this.makeSpaceCube(options.creds);
                const res = await spacecube.download(opt);
                if (res.rc !== 0) {
                    console.error('Cant complete download');
                    console.error(res);
                    process.exit(1);
                }
            });

        program
            .command("delete")
            .description("delete a file")
            .argument("<bucket>", "Bucket name")
            .argument("<remotePath>", "Remote path")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .option("-r, --recursive", "Delete all files in a directory", false)
            .option("-v, --verbose", "Verbose output", false)
            .action(async (bucket, remotePath, options) => {
                if (remotePath === '.') remotePath = '';
                const spacecube = this.makeSpaceCube(options.creds);
                const opt: SpaceCube.DeleteOptions = {
                    bucket,
                    remotePath,
                    recursive: options.recursive,
                    verbose: options.verbose
                };
                const res = await spacecube.delete(opt);
                if (res.rc !== 0) {
                    console.error('Cant delete');
                    console.error(res);
                    process.exit(1);
                }
            });
        
        program
            .command("get")
            .description("print file contents")
            .argument("<bucket>", "Bucket name")
            .argument("<remotePath>", "Remote file path")
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .action(async (bucket, remotePath, options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const opt: SpaceCube.GetOptions = {
                    bucket,
                    remotePath
                };
                const res = await spacecube.get(opt);
                if (res.rc !== 0) {
                    console.error('Cant get file');
                    console.error(res);
                    process.exit(1);
                }
                console.log(res.data.toString());
            });
        
        program
            .command("put")
            .description("put a file (upload or update)")
            .argument("<bucket>", "Bucket name")
            .argument("<remotePath>", "Remote dir path")
            .argument("<data>", "Data to upload")
            .option("-p, --public", "Make file public", true)
            .option("-c, --creds <path>", "Credentials path", this.defaultCredsPath)
            .action(async (bucket, remotePath, data, options) => {
                const spacecube = this.makeSpaceCube(options.creds);
                const opt: SpaceCube.PutOptions = {
                    bucket,
                    data,
                    remotePath,
                    publicAccess: options.public
                };
                const res = await spacecube.put(opt);
                if (res.rc !== 0) {
                    console.error('Cant put file');
                    console.error(res);
                    process.exit(1);
                }
            });

        program.addHelpText('after', `
Tips:
- Most commands take a -c flag to specify a credentials file path.
  - By default, it looks for a file at ${this.defaultCredsPath}
    `);

        program.parse();
    }

    private magicPath(localPath: string): string {
        if (localPath.startsWith('~')) {
            return localPath.replace(/^~\//, (process.env.HOME || process.env.USERPROFILE) + '/');
        }
        if (localPath.startsWith('.')) {
            localPath = `${process.cwd()}/${localPath.substring(1)}`;
            return localPath;
        }
        return localPath;
    }

    private makeSpaceCube(credsPath: string): SpaceCube.Cube {
        credsPath = this.magicPath(credsPath);
        if (!fs.existsSync(credsPath)) {
            console.error("Credentials file not found:");
            console.error(credsPath);
            process.exit(1);
        }
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8")) as SpaceCube.Creds;
            return new SpaceCube.Cube(creds);
        }
        catch (e) {
            console.error("Credentials file is not a valid JSON file:");
        }
        process.exit(1);
    }
}

new SpaceCubeCLI().run();