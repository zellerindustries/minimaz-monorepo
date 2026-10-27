// Many locals force two-letter names; globals with short names must not be captured.
var a = 'global a', b = 'global b', aa = 'global aa', ba = 'global ba', $ = 'global $', _ = 'global _'
;(function () {
    const v1 = 1, v2 = 2, v3 = 3, v4 = 4, v5 = 5, v6 = 6, v7 = 7, v8 = 8, v9 = 9, v10 = 10
    const v11 = 11, v12 = 12, v13 = 13, v14 = 14, v15 = 15, v16 = 16, v17 = 17, v18 = 18, v19 = 19, v20 = 20
    const v21 = 21, v22 = 22, v23 = 23, v24 = 24, v25 = 25, v26 = 26, v27 = 27, v28 = 28, v29 = 29, v30 = 30
    const v31 = 31, v32 = 32, v33 = 33, v34 = 34, v35 = 35, v36 = 36, v37 = 37, v38 = 38, v39 = 39, v40 = 40
    const v41 = 41, v42 = 42, v43 = 43, v44 = 44, v45 = 45, v46 = 46, v47 = 47, v48 = 48, v49 = 49, v50 = 50
    const v51 = 51, v52 = 52, v53 = 53, v54 = 54, v55 = 55, v56 = 56, v57 = 57, v58 = 58, v59 = 59, v60 = 60
    const v61 = 61, v62 = 62, v63 = 63, v64 = 64, v65 = 65, v66 = 66, v67 = 67, v68 = 68, v69 = 69, v70 = 70
    const sum =
        v1 + v2 + v3 + v4 + v5 + v6 + v7 + v8 + v9 + v10 + v11 + v12 + v13 + v14 + v15 + v16 + v17 + v18 +
        v19 + v20 + v21 + v22 + v23 + v24 + v25 + v26 + v27 + v28 + v29 + v30 + v31 + v32 + v33 + v34 + v35 +
        v36 + v37 + v38 + v39 + v40 + v41 + v42 + v43 + v44 + v45 + v46 + v47 + v48 + v49 + v50 + v51 + v52 +
        v53 + v54 + v55 + v56 + v57 + v58 + v59 + v60 + v61 + v62 + v63 + v64 + v65 + v66 + v67 + v68 + v69 + v70
    log(sum, a, b, aa, ba, $, _)
    function inner() {
        const x1 = 'x1', x2 = 'x2'
        return [x1, x2, v70, v1, a, aa, typeof ca, typeof da]
    }
    log(inner())
    function implicitGlobal() {
        zz = 'implicit'
    }
    implicitGlobal()
    function readsImplicit() {
        const local = 'local'
        return [local, zz]
    }
    log(readsImplicit())
    function defineIn() {
        const ifx = 1, inx = 2, dox = 3
        return ifx + inx + dox
    }
    log(defineIn())
    function manyParams(p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15, p16, p17, p18,
        p19, p20, p21, p22, p23, p24, p25, p26, p27, p28, p29, p30, p31, p32, p33, p34, p35, p36, p37, p38,
        p39, p40, p41, p42, p43, p44, p45, p46, p47, p48, p49, p50, p51, p52, p53, p54, p55, p56, p57, p58) {
        const body1 = p1 + p58, body2 = p2 + p57
        return () => [body1, body2, p30, a, b, $, _, typeof ab, typeof bb]
    }
    log(manyParams(...Array.from({ length: 58 }, (_, i) => i))())
    globalThis.lateGlobal = 'late'
    function readsLate() {
        const shadowCandidate = 1
        return [lateGlobal, shadowCandidate]
    }
    log(readsLate())
})()
