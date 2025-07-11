/**
 * AVISO IMPORTANTE
 * -----------------
 * Este arquivo existe apenas para manter compatibilidade temporária com
 * partes antigas do código que ainda importam de "@/lib/database".
 *
 * Todo o acesso real a dados agora deve ser feito através das Server
 * Actions definidas em `app/actions.ts`.
 *
 * Substitua, gradualmente, todos os imports de "@/lib/database" pelos
 * métodos em `@/app/actions` e, quando terminar, remova este arquivo.
 */

function deprecated(name: string): never {
	throw new Error(
		`Função "${name}" foi descontinuada. ` + `Use as Server Actions (app/actions.ts) em vez de "@/lib/database".`,
	);
}

export const getCategories = () => deprecated("getCategories");
export const getLinks = () => deprecated("getLinks");
export const getLinksBySubcategory = () => deprecated("getLinksBySubcategory");
export const getMasterCategories = () => deprecated("getMasterCategories");
export const getSubcategories = () => deprecated("getSubcategories");
export const getTotalRedirects = () => deprecated("getTotalRedirects");
export const createCategory = () => deprecated("createCategory");
export const createLink = () => deprecated("createLink");
export const createMasterCategory = () => deprecated("createMasterCategory");
export const createSubcategory = () => deprecated("createSubcategory");
