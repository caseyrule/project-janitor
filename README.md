# Project Janitor

Keeps your project code clean and standardized.

## Features

### Clean up document (`janitor.cleanUpActiveDocument`)

Performs clean up actions specified in `janitor.commands` on the current active document.

### Clean up project (`janitor.cleanUpProject`)



Opens and cleans up each file specified by `janitor.includePattern` and `janitor.excludePattern`.

## Requirements

VSCode v1.19.0 or higher

Project dependencies:

* `typescript-logging@^0.5.0"`

## Extension Settings

This extension contributes the following settings:

* `janitor.commands`: The commands to execute for each file
* `janitor.excludePattern`: Files to exclude for clean up
* `janitor.includePattern`: Files to include for clean up
* `janitor.skipConfirmation`: Skips the confirmation before cleaning the entire project