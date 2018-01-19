'use strict';
import * as vscode from 'vscode';
import { ExtensionContext, GlobPattern, TextDocument, Uri, ViewColumn, WorkspaceConfiguration } from 'vscode';

import { Promiser } from './Promiser';
import { VSCExtension } from './VSCExtension';

export function activate(context: vscode.ExtensionContext) {
  VSCExtension.activate(new ProjectJanitor(context), ['cleanUpActiveDocument', 'cleanUpProject']);
}

export function deactivate() {}

class ProjectJanitorConfig {
  config: WorkspaceConfiguration = vscode.workspace.getConfiguration('projectJanitor');

  get commands(): string[] {
    return this.config.get<string[]>('commands', ['editor.action.formatDocument']);
  }

  get excludePattern(): GlobPattern {
    return this.config.get<string[]>('excludePattern', ['**/node_modules/**/*']).join(',');
  }

  get includePattern(): GlobPattern {
    return this.config.get<string[]>('includePattern', ['src/**/*.ts']).join(',');
  }

  get skipConfirmation(): boolean {
    return this.config.get<boolean>('skipConfirmation');
  }
}

class ProjectJanitor extends VSCExtension {
  private config: ProjectJanitorConfig;

  constructor(context: ExtensionContext) {
    super(context, 'janitor', 'Project Janitor');
    this.config = new ProjectJanitorConfig();
  }

  public cleanUpActiveDocument(): void {
    if (!vscode.window.activeTextEditor) {
      this.logger.info('No active document.');
    } else {
      Promiser.try(() => this.cleanUpDocument(vscode.window.activeTextEditor.document), e => this.onError(e));
    }
  }

  public cleanUpProject(): void {
    Promiser.try(
      () =>
        this.confirm(this.config.skipConfirmation)
          .then(() => this.checkForUnsavedWork())
          .then(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))
          .then(() => {
            this.logger.info('Cleaning up project...');
            return vscode.workspace.findFiles(this.config.includePattern, this.config.excludePattern);
          })
          .then(files => {
            this.logger.info(`Cleaning up ${files.length} files:`);
            return this.forEachFile(files.sort(ProjectJanitor.compareUris), doc => this.cleanUpDocument(doc));
          })
          .then(count => this.logger.info(`Modified ${count} files.`))
          .then(() => vscode.commands.executeCommand('workbench.action.closeEditorsInGroup')),
      e => this.onError(e)
    );
  }

  private onError(e: any) {
    console.log(e);
    this.logger.error(e.message);
    vscode.window.showErrorMessage(e.message);
  }

  private cleanUpDocument(doc: TextDocument): PromiseLike<boolean> {
    const originalText: string = doc.getText();
    let edited: boolean = false;

    return vscode.window
      .showTextDocument(doc, ViewColumn.Active)
      .then(() => this.executeCommandSequence(this.config.commands))
      .then(() => {
        if (doc.isDirty && doc.getText() != originalText) {
          edited = true;
          this.logger.info(` - ${vscode.workspace.asRelativePath(doc.fileName)}`);
          return doc.save();
        }
      })
      .then(() => edited);
  }

  private checkForUnsavedWork() {
    return Promiser.onlyIf(() => {
      let needSave: boolean = false;

      return Promiser.forEach(vscode.workspace.textDocuments, document => {
        if (document.isDirty) {
          needSave = true;
          return vscode.window.showTextDocument(document, ViewColumn.Active);
        }
      }).then(() => (needSave ? this.promptSave() : true));
    });
  }

  private promptSave(): PromiseLike<boolean> {
    return vscode.window
      .showErrorMessage('Save all your files before running clean up.', 'Save all', 'Cancel')
      .then(val => {
        if (val === 'Save all') {
          return vscode.workspace.saveAll().then(() => true);
        } else {
          return false;
        }
      });
  }

  private confirm(skipConfirmation: boolean = false): Thenable<void> {
    if (skipConfirmation) {
      return Promise.resolve();
    } else {
      return Promiser.onlyIf(() =>
        vscode.window
          .showQuickPick([
            {
              confirmed: false,
              label: 'Cancel',
              description: ''
            },
            {
              confirmed: true,
              label: 'Continue',
              description: `Make sure you've backed up your code first.`
            }
          ])
          .then(val => val.confirmed)
      );
    }
  }

  private static compareUris(a: Uri, b: Uri): number {
    return a.path.localeCompare(b.path);
  }
}
