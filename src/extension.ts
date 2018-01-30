import * as fs from 'fs-extra';
import * as JsDiff from 'diff';
import { Promiser, Promised } from './promiser';

import {
  vscode,
  VSCExtension,
  ExtensionContext,
  TextDocument,
  Uri,
  ViewColumn,
  WorkspaceConfiguration,
  commands
} from 'vscex';

interface RenameRule {
  match: string;
  rename: string;
}

interface FileRename {
  from: string;
  to: string;
}

class CleanUpCommand {
  readonly name: string;
  private readonly target: RegExp;

  constructor(cmd: string) {
    if (cmd.includes('@')) {
      const split = cmd.split('@');

      this.name = split[0];
      this.target = new RegExp(split[1]);
    } else {
      this.name = cmd;
      this.target = null;
    }
  }

  targets(uri: Uri): boolean {
    if (this.target) {
      return this.target.test(vscode.workspace.asRelativePath(uri.path));
    }

    return true;
  }
}

class ProjectJanitorConfig {
  private _commands: CleanUpCommand[];

  get closeAllAfterCleanUp(): boolean {
    return this.config.get<boolean>('closeAllAfterCleanUp');
  }

  get commands(): CleanUpCommand[] {
    if (this._commands === undefined) {
      this._commands = [];
      const configCommands: string[] = this.config.get<string[]>('commands', ['editor.action.formatDocument']);

      for (const cmd of configCommands) {
        this._commands.push(new CleanUpCommand(cmd));
      }
    }

    return this._commands;
  }

  get excludePattern(): string {
    return this.config
      .get<string[]>('excludePattern', ['**/assets/**/*', '**/dist/**/*', '**/node_modules/**/*'])
      .join(',');
  }

  get fileRenameRules(): RenameRule[] {
    return this.config.get<RenameRule[]>('fileRenameRules');
  }

  get includePattern(): string {
    return this.config.get<string[]>('includePattern', ['src/**/*.ts']).join(',');
  }

  get showDiffOnCleanUp(): boolean {
    return this.config.get<boolean>('showDiffOnCleanUp');
  }

  get skipConfirmation(): boolean {
    return this.config.get<boolean>('skipConfirmation');
  }

  private get config(): WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('janitor');
  }
}

export class ProjectJanitor extends VSCExtension {
  private config: ProjectJanitorConfig;

  constructor(context: ExtensionContext) {
    super(context, 'janitor', 'Project Janitor');
    this.config = new ProjectJanitorConfig();
  }

  public cleanUpActiveDocument(): void {
    if (!vscode.window.activeTextEditor) {
      this.log.info('No active document.');
    } else {
      Promiser.try(
        () =>
          this.cleanUpDocument(vscode.window.activeTextEditor.document).then(edited => {
            if (edited) {
              this.log.info(`Finished cleaning up ${this.relativePath(vscode.window.activeTextEditor.document.uri)}`);
            } else {
              this.log.info(
                `No clean up required for ${this.relativePath(vscode.window.activeTextEditor.document.uri)}`
              );
            }
          }),
        e => this.onError(e)
      );
    }
  }

  public validateFileNames(): void {
    const rules = this.config.fileRenameRules;

    if (rules && rules.length > 0) {
      Promiser.try(
        () =>
          Promiser.if(true)
            .then(() => this.checkForUnsavedWork())
            .then(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))
            .then(() => {
              this.log.info('Validating file names...');
              return this.findFiles(this.config.includePattern, this.config.excludePattern);
            })
            .then(files => {
              const renames: FileRename[] = [];

              this.log.info(`Validating ${files.length} file names:`);

              for (let file of files) {
                const path = this.relativePath(file);

                for (let rule of this.config.fileRenameRules) {
                  const regEx: RegExp = new RegExp(rule.match);

                  if (regEx.test(path)) {
                    const newPath = path.replace(regEx, rule.rename);

                    this.log.info(` - ${path} -> ${newPath}`);
                    renames.push({
                      from: path,
                      to: newPath
                    });
                  }
                }
              }

              return this.performRenames(renames);
            })
            .then(() => this.log.info(`Done.`)),
        e => this.onError(e)
      );
    } else {
      vscode.window.showErrorMessage('No rules configured');
    }
  }

  public cleanUpProject(): void {
    Promiser.try(
      () =>
        Promiser.if(() => this.confirm(this.config.skipConfirmation, `Make sure you've backed up your code first.`))
          .then(() => this.checkForUnsavedWork())
          .then(() => vscode.commands.executeCommand('workbench.action.closeAllEditors'))
          .then(() => {
            this.log.info('Cleaning up project...');
            return vscode.workspace.findFiles(this.config.includePattern, this.config.excludePattern);
          })
          .then(files => {
            this.log.info(`Cleaning up ${files.length} files:`);
            return this.forEachFile(files.sort(ProjectJanitor.compareUris), doc => this.cleanUpDocument(doc));
          })
          .then(count => this.log.info(`Modified ${count} files.`))
          .then(() => {
            if (this.config.closeAllAfterCleanUp) {
              vscode.commands.executeCommand('workbench.action.closeEditorsInGroup');
            }
          }),
      e => this.onError(e)
    );
  }

  private onError(e: any): void {
    try {
      if (e) {
        if (e instanceof Error) {
          this.log.error(e.message, e);
          vscode.window.showErrorMessage(e.message);
        } else {
          this.log.error('Error: ' + e);
          vscode.window.showErrorMessage('Error: ' + e);
        }
      } else {
        console.error(new Error('Undefined error'));
      }
    } catch (e2) {
      console.error(e);
    }
  }

  private cleanUpDocument(doc: TextDocument): Thenable<boolean> {
    const originalText: string = doc.getText();
    const commandNames: string[] = this.config.commands.filter(cmd => cmd.targets(doc.uri)).map(cmd => cmd.name);
    let edited: boolean = false;

    return vscode.window
      .showTextDocument(doc)
      .then(() => {
        this.log.debug(`\t- ${this.relativePath(doc.uri)} << ${commandNames}`);
      })
      .then(() => this.executeCommandSequence(commandNames))
      .then(() => {
        if (doc.isDirty && doc.getText() !== originalText) {
          const diff = JsDiff.diffLines(doc.getText(), originalText);

          edited = true;
          this.log.info(`\t- ${this.relativePath(doc.uri)} (${diff.length} lines changed)`);

          if (this.config.showDiffOnCleanUp) {
            for (const line of diff) {
              let c: string = '';

              if (line.added) {
                c = '+';
              } else {
                c = '-';
              }

              this.log.info(`${c} ${line.value}`);
            }
          }

          return doc.save();
        } else {
          this.log.debug(`\t- ${this.relativePath(doc.uri)}`);
        }
      })
      .then(() => edited);
  }

  private checkForUnsavedWork(): Promised<void> {
    return Promiser.if(() => {
      let needSave: boolean = false;

      return Promiser.forEach(vscode.workspace.textDocuments, document => {
        if (document.isDirty) {
          needSave = true;
          return vscode.window.showTextDocument(document);
        }
      }).then(() => (needSave ? this.promptSave() : true));
    });
  }

  private performRenames(renames: FileRename[]): Thenable<any> {
    return Promiser.if(this.confirm(this.config.skipConfirmation, `Rename ${renames.length} files`)).then(() => {
      const promises: Promise<void>[] = [];

      for (let rename of renames) {
        this.log.info(`Renaming ${rename.from} to ${rename.to}`);
        promises.push(fs.rename(rename.from, rename.to));
      }

      return Promise.all(promises);
    });
  }

  private promptSave(): Thenable<boolean> {
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

  private confirm(
    skipConfirmation: boolean = false,
    continueMessage?: string,
    cancelMessage?: string
  ): Thenable<boolean> {
    if (skipConfirmation) {
      return Promise.resolve(true);
    } else {
      return vscode.window
        .showQuickPick([
          {
            confirmed: true,
            label: 'Continue',
            description: continueMessage
          },
          {
            confirmed: false,
            label: 'Cancel',
            description: cancelMessage
          }
        ])
        .then(val => val.confirmed);
    }
  }

  private static compareUris(a: Uri, b: Uri): number {
    return a.path.localeCompare(b.path);
  }

  public static activate(extension: ProjectJanitor, methods: Array<keyof ProjectJanitor>): void {
    VSCExtension.registerMethods(extension, methods);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  ProjectJanitor.activate(new ProjectJanitor(context), [
    'cleanUpActiveDocument',
    'cleanUpProject',
    'validateFileNames'
  ]);
}

export function deactivate(): void {}
