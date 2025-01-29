# SpaceCube
SpaceCube is a wrapper API and CLI tool for working with Digital Ocean Spaces or other S3 compatible services. It can be used stand-alone as a CLI application or used as a library in your own JS/TS projects. 

The CLI and the API share nearly the exact same interface which makes it straight-forward to prototype workflows with the CLI and then formalize them into API calls. 

**CLI Example**
```bash
% spacecube buckets
[
  "bucket1",
  "bucket2",
  "bucket3"
]

% spacecube upload -r -v myBucket dist .
Uploading dist/SpaceCube.js
Uploading dist/SpaceCubeCLI.js
```
**API Example:**
```ts
import * as Space from "./SpaceCube";
const creds: Space.Creds = {
  "s3_endpoint": "https://sfo3.digitaloceanspaces.com",
  "s3_region": "us-east-1",
  "s3_access_key": "DO.................",
  "s3_secret_key": "dZ................." 
}
const space = new Space.SpaceCube(creds);
async function example() {
  const listing = await space.listBuckets();
  console.log(listing);
}
example();
```

*This is not intended to be the fastest or most robust S3 tool around. It's purpose is to stay simple and fill a niche for "indie" developers who don't want waste their weekends reading S3 SDK docs.*

**Note: This project is currently download and uploads files synchronously which can be pretty slow for very large operations.**

# Install
To install `spacecube` as a dependency of you app do:
```
npm install spacecube
```
If you want the CLI as a globally runnable command do:
```
npm install -g spacecube
``` 
You can also run `spacecube` via `npx`:
```
npx spacecube
```
If you think `spacecube` is too long to type do something like:
```
alias s3=spacecube
```

# Using the CLI
By default the cli is available at `spacecube` when this package is installed globally.

## Authentication
This program needs a credentials `json` file to authenticate. The file looks something like this:
```json
{
    "s3_endpoint": "https://sfo3.digitaloceanspaces.com",
    "s3_region": "us-east-1",
    "s3_access_key": "DO.................",
    "s3_secret_key": "dZ................."
}
```

- The CLI will look in one of two places for your credentials `json` file. 
    - By default it will look for `~/.spacecube.json`.
    - If the `-c` flag is used it will look for the path following the flag.

You can create a new credentials file with the `auth` command or be guided through creating it with the `auth-wiz` command.

## Usage
```
Options:
  -V, --version                                         output the version number
  -h, --help                                            display help for command

Commands:
  auth [options]                                        create a credentials file
  auth-wizard                                           create a credentials file interactively
  bucket-new [options] <bucket>                         create a new bucket
  bucket-delete [options] <bucket>                      delete a bucket
  buckets [options]                                     list all buckets
  list [options] <bucket>                               list files
  upload [options] <bucket> <localPath> <remotePath>    upload a file
  download [options] <bucket> <remotePath> <localPath>  download a file
  delete [options] <bucket> <remotePath>                delete a file
  get [options] <bucket> <remotePath>                   print file contents
  put [options] <bucket> <remotePath> <data>            put a file (upload or update)
  help [command]                                        display help for command
  ```

# Using the API
## Basic Example
Include the library in your project:
```ts
// Get a list of files at myBucket:myDir/
import * as Space from "./SpaceCube";
const creds: Space.Creds = {
  "s3_endpoint": "https://sfo3.digitaloceanspaces.com",
  "s3_region": "us-east-1",
  "s3_access_key": "DO.................",
  "s3_secret_key": "dZ................." 
}
const space = new Space.SpaceCube(creds);
async function example() {
  const opt: Space.ListOptions = {
    bucket: 'myBucket';
    remotePath: 'myDir/';
  }
  const listing = await space.list(opt);
  console.log(listing);
}
example();
```
## Credentials
The API takes credentials in the same format as the CLI. The API constructor expects an object like this:
```ts
type Creds = {
    s3_endpoint: string;
    s3_region: string;
    s3_access_key: string;
    s3_secret_key: string;
};
```
## API Responses
Calls to the API always return an object like this:
```ts
type Res = {
    rc: number;
    data?: any;
    err?: any;
};
```
- `rc` - the return code (0 == ok)
- `data?` - the return data (if any)
- `err?` - the error that was encountered (if any)

## API Methods
All API methods are `async`.
### `createBucket(bucket: string)`
Creates a new bucket with the given bucket name.
### `deleteBucket(bucket: string)`
Delete a bucket with the given name.
### `listBuckets()`
Returns a list of your buckets.
### `list(opt: ListOptions)`
```ts
type ListOptions = {
    bucket: string;
    remotePath?: string; // Filter by path
}
```
Returns a list of items in the given bucket.
### `upload(opt: UploadOptions)`
```ts
type UploadOptions = {
    bucket: string;
    localPath: string;
    remotePath: string;
    publicAccess?: boolean;
    recursive?: boolean;
    mimeTypeOverride?: string;
    verbose?: boolean;
}
```
Uploads a file or directory to the given bucket. Use the `recursive` option to upload directories. 
### `download(opt: DownloadOptions)`
```ts
type DownloadOptions = {
    bucket: string;
    remotePath: string;
    localPath: string;
    recursive?: boolean;
    verbose?: boolean;
}
```
Downloads a file or directory from the given bucket. Use the `recursive` option to download directories.
### `delete(opt: DeleteOptions)`
```ts
type DeleteOptions = {
    bucket: string;
    remotePath: string;
    recursive?: boolean;
    verbose?: boolean;
}
```
Deletes a file or directory from the given bucket. Use the `recursive` option to download directories.
### `get(opt: GetOptions)`
```ts
type GetOptions = {
    bucket: string;
    remotePath: string;
}
```
Get the file contents and return it. Does not "download" the file.
### `put(opt: PutOptions)`
```ts
type PutOptions = {
    bucket: string;
    remotePath: string;
    data: any;
    publicAccess?: boolean;
    mimeTypeOverride?: string;
}
```
Put some data directly from RAM into the bucket. Does not "upload" a file.