// String escapes and quoting edge cases.
;(function () {
    const values = [
        'single',
        "double",
        'it\'s',
        "say \"hi\"",
        'both \' and "',
        '\n\t\r\b\f\v\0',
        '  ',
        '\ud800',
        '\udc00\ud800',
        '\x41\u{1F600}',
        '\101\0' + '8',
        '\0' + '1',
        '</script>',
        '<!-- not a comment',
        'line \
continuation',
        '\\',
        '${not template}',
        'é́',
        '\u{10FFFF}',
        '\x7f\x80\x9f\xa0\xad',
        '﻿​',
        '`backtick`',
        "'",
        '"',
        '\'"',
        '\'\'"',
        '',
    ]
    log(values.map((s) => [...s].map((c) => c.codePointAt(0))))
    log(values.map((s) => s.length))
})()
