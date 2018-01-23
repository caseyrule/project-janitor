'use strict';
import * as vscode from 'vscode';
import { ExtensionContext } from 'vscode';

import { ProjectJanitor } from './project-janitor';

export function activate(context: vscode.ExtensionContext): void {
  ProjectJanitor.activate(new ProjectJanitor(context), [
    'cleanUpActiveDocument',
    'cleanUpProject',
    'validateFileNames'
  ]);
}

export function deactivate(): void {}
