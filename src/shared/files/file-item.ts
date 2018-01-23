import * as fs from 'fs-extra';
import * as path from 'path';

export class FileSpec {
  constructor(public srcPath: string, public targetPath?: string) {}

  get exists(): boolean {
    return fs.existsSync(this.targetPath);
  }

  public move(): Promise<FileSpec> {
    return this.ensureDir()
      .then(() => fs.rename(this.srcPath, this.targetPath))
      .then(() => {
        this.srcPath = this.targetPath;
        return this;
      });
  }

  public duplicate(): Promise<FileSpec> {
    return this.ensureDir()
      .then(() => fs.copy(this.srcPath, this.targetPath))
      .then(() => new FileSpec(this.targetPath));
  }

  public remove(): Promise<FileSpec> {
    return Promise.resolve(fs.remove(this.srcPath)).then(() => this);
  }

  public create(isDir: boolean = false): Promise<FileSpec> {
    const fn = isDir ? fs.ensureDir : fs.createFile;

    return Promise.resolve(fs.remove(this.targetPath))
      .then(() => fn(this.targetPath))
      .then(() => new FileSpec(this.targetPath));
  }

  private ensureDir(): Promise<any> {
    return Promise.resolve(fs.ensureDir(path.dirname(this.targetPath)));
  }
}
