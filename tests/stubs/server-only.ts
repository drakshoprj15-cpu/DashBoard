/**
 * `server-only` é resolvido pelo Next, não por um pacote instalado. Os testes
 * correm em Vite, que não sabe disso: sem este substituto, qualquer módulo com
 * a proteção no topo — e são os que tocam em segredos — ficava sem teste.
 */
export {};
