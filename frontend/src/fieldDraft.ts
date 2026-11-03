export type FieldDraft = { values: Record<string, unknown>; files: { file: File; stage: string }[] };
async function store<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open("towntrack-field-drafts",1);request.onupgradeneeded=()=>request.result.createObjectStore("drafts");request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 return new Promise<T>((resolve,reject)=>{const transaction=db.transaction("drafts",mode);const request=action(transaction.objectStore("drafts"));transaction.oncomplete=()=>{resolve(request.result);db.close();};transaction.onerror=()=>{reject(transaction.error);db.close();};});
}
export const readDraft=(key:string)=>store<FieldDraft|undefined>("readonly",s=>s.get(key));
export const saveDraft=(key:string,draft:FieldDraft)=>store("readwrite",s=>s.put(draft,key));
export const removeDraft=(key:string)=>store("readwrite",s=>s.delete(key));
