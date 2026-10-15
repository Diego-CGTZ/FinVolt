/// <reference types="node" />
/**
 * Proceso hijo del QA runner: carga una suite y ejecuta su funcion exportada.
 * Uso: npx tsx tests/qaChild.ts <archivo-relativo-sin-.test> <nombreFuncion>
 */
async function main() {
  const [file, fn] = process.argv.slice(2);
  const mod = await import(`./unit/${file}.test`);
  await mod[fn]();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[FAIL]', e && (e as Error).message ? (e as Error).message : e);
    process.exit(1);
  });
