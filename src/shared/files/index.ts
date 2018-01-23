import * as fs from 'fs';
import * as path from 'path';
import { commands, TextDocument, TextEditor, Uri, ViewColumn, window, workspace } from 'vscode';

import { FileSpec } from './file-item';

export interface MoveFileDialogOptions {
  prompt: string;
  showFullPath?: boolean;
  uri?: Uri;
}

export interface NewFileDialogOptions {
  prompt: string;
  relativeToRoot?: boolean;
}

export interface CreateFileOptions {
  file: FileSpec;
  isDir?: boolean;
}

export class FileController {
  public showMoveFileDialog(options: MoveFileDialogOptions): Promise<FileSpec> {
    const { prompt, showFullPath = false, uri = null } = options;
    const sourcePath = (uri && uri.fsPath) || this.path;

    if (!sourcePath) {
      return Promise.reject(null);
    }

    const value = showFullPath ? sourcePath : path.basename(sourcePath);
    const valueSelection = this.getFilenameSelection(value);

    return Promise.resolve(window.showInputBox({ prompt, value, valueSelection })).then(targetPath => {
      if (targetPath) {
        targetPath = path.resolve(path.dirname(sourcePath), targetPath);
        return new FileSpec(sourcePath, targetPath);
      }
    });
  }

  public showNewFileDialog(options: NewFileDialogOptions): Promise<FileSpec> {
    const { prompt, relativeToRoot = false } = options;

    let sourcePath = ''; // workspace.rootPath;

    if (!relativeToRoot && this.path) {
      sourcePath = path.dirname(this.path);
    }

    if (!sourcePath) {
      return Promise.reject(null);
    }

    return Promise.resolve(window.showInputBox({ prompt })).then(targetPath => {
      if (targetPath) {
        targetPath = path.resolve(sourcePath, targetPath);
        return new FileSpec(sourcePath, targetPath);
      }
    });
  }

  public showRemoveFileDialog(): Promise<FileSpec> {
    const sourcePath = this.path;

    if (!sourcePath) {
      return Promise.reject(null);
    }

    const message = `Are you sure you want to delete '${path.basename(sourcePath)}'?`;
    const action = 'Delete';

    return Promise.resolve(window.showInformationMessage(message, { modal: true }, action)).then(
      remove => remove && new FileSpec(sourcePath)
    );
  }

  public move(file: FileSpec): Promise<FileSpec> {
    return this.ensureWritableFile(file).then(() => file.move());
  }

  public duplicate(file: FileSpec): Promise<FileSpec> {
    return this.ensureWritableFile(file).then(() => file.duplicate());
  }

  public remove(file: FileSpec): Promise<FileSpec> {
    return file.remove().catch(() => Promise.reject(`Error deleting file '${file.srcPath}'.`));
  }

  public create(options: CreateFileOptions): Promise<FileSpec> {
    const { file, isDir = false } = options;

    return this.ensureWritableFile(file)
      .then(() => file.create(isDir))
      .catch(() => Promise.reject(`Error creating file '${file.targetPath}'.`));
  }

  public openFileInEditor(file: FileSpec): Promise<TextEditor> {
    const isDir = fs.statSync(file.srcPath).isDirectory();

    if (isDir) {
      return;
    }

    return Promise.resolve(workspace.openTextDocument(file.srcPath))
      .then(textDocument => {
        return textDocument ? Promise.resolve(textDocument) : Promise.reject(new Error('Could not open file!'));
      })
      .then(textDocument => window.showTextDocument(textDocument, ViewColumn.Active))
      .then(editor => {
        return editor ? Promise.resolve(editor) : Promise.reject(new Error('Could not show document!'));
      });
  }

  public closeCurrentFileEditor(): Thenable<any> {
    return commands.executeCommand('workbench.action.closeActiveEditor');
  }

  private get path(): string {
    const activeEditor: TextEditor = window.activeTextEditor;
    const document: TextDocument = activeEditor && activeEditor.document;

    return document && document.fileName;
  }

  private ensureWritableFile(file: FileSpec): Promise<FileSpec> {
    if (!file.exists) {
      return Promise.resolve(file);
    }

    const message = `File '${file.targetPath}' already exists.`;
    const action = 'Overwrite';

    return Promise.resolve(window.showInformationMessage(message, { modal: true }, action)).then(
      overwrite => (overwrite ? Promise.resolve(file) : Promise.reject(null))
    );
  }

  private getFilenameSelection(value: string): [number, number] {
    const basename = path.basename(value);
    const start = value.length - basename.length;
    const dot = basename.lastIndexOf('.');

    if (dot <= 0) {
      // file with no extension or ".editorconfig" like file
      return [start, value.length];
    }

    // select basename without extension
    return [start, start + dot];
  }
}
