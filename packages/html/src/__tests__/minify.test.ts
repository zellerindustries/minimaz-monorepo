import { describe, expect, it } from 'vitest'
import { minifyHtml } from '../minify.js'

describe('minifyHtml', () => {
    it('collapses whitespace and strips ordinary comments', async () => {
        expect(await minifyHtml('  <div>  <!-- c -->  <p>  hi  </p> </div>  ')).toBe(
            '<div><p>hi</p></div>',
        )
    })

    it('keeps comments starting with !', async () => {
        expect(await minifyHtml('<!--! keep --><p>x</p>')).toBe('<!--! keep --><p>x</p>')
    })

    it('minifies inline style and script contents', async () => {
        expect(
            await minifyHtml('<style> a { color : red } </style><script> var  a = 1 ; </script>'),
        ).toBe('<style>a{color:red}</style><script>var a=1</script>')
    })

    it('returns an empty string for whitespace-only input', async () => {
        expect(await minifyHtml('   ')).toBe('')
    })

    it('rejects a non-string input', async () => {
        await expect(minifyHtml(1 as unknown as string)).rejects.toThrow(
            'minifyHtml: code must be a string',
        )
    })
})
