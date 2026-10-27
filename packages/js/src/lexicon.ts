/** Four-character punctuators. */
export const punctuators4: ReadonlySet<string> = new Set(['>>>='])

/** Three-character punctuators. */
export const punctuators3: ReadonlySet<string> = new Set([
    '...',
    '===',
    '!==',
    '**=',
    '<<=',
    '>>=',
    '>>>',
    '&&=',
    '||=',
    '??=',
])

/** Two-character punctuators. */
export const punctuators2: ReadonlySet<string> = new Set([
    '=>',
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '??',
    '?.',
    '++',
    '--',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '&=',
    '|=',
    '^=',
    '<<',
    '>>',
    '**',
])

/** Single-character punctuators. */
export const punctuators1: ReadonlySet<string> = new Set('{}()[];,<>+-*/%&|^!~?:=.'.split(''))

/** Words reserved in all code. */
export const reservedWords: ReadonlySet<string> = new Set([
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
])

/** Reserved only in strict mode code. */
export const strictReservedWords: ReadonlySet<string> = new Set([
    'implements',
    'interface',
    'let',
    'package',
    'private',
    'protected',
    'public',
    'static',
    'yield',
])
