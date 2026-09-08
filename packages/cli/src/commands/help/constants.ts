import type { CommandHelp } from './types.js';

export const commandsHelp: Record<string, CommandHelp> = {
    help: {
        usage: 'minimaz help | h',
        description: 'Show this help message',
    },
    version: {
        usage: 'minimaz version | v',
        description: 'Show Minimaz version',
    },
    validate: {
        usage: 'minimaz validate --path=<file>',
        description: 'Validate a CSS, HTML, JS, TS, or JSON file',
        options: {
            '--path <file>': 'Path to the file to validate',
        },
    },
    init: {
        usage: 'minimaz init [name] [--template=<name>] [--npm] [--git] [--gitprovider=<provider>]',
        description: 'Scaffold a new project from a template',
        options: {
            '--template <name>': 'Template to scaffold from (default: "default")',
            '--npm': 'Run npm install (skips the interactive prompt)',
            '--git': 'Initialize a Git repository (skips the interactive prompt)',
            '--gitprovider <provider>': '"local" | "github" | "gitlab" | a remote URL',
        },
    },
    config: {
        usage: 'minimaz config [--overwrite]',
        description:
            'Seed (or re-seed) the global ~/.minimaz directory with default templates and settings',
        options: {
            '--overwrite': 'Replace existing seeded templates/settings',
        },
    },
    template: {
        usage: 'minimaz template [path] [--list] [--delete=<name>] [--update[=<name>]]',
        description: 'Manage global templates: save, list, delete, or update',
        options: {
            '--list': 'List available global templates',
            '--delete <name>': 'Delete a global template',
            '--update <name>':
                'Update a named template from the given path (re-seeds all from defaults if no name given)',
        },
    },
    docs: {
        usage: 'minimaz docs <init|build>',
        description: 'Scaffold or build Markdown documentation',
    },
};
