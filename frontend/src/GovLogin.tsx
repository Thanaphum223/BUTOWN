import { useEffect, useState } from "react";
import { Alert, Button, Form, Input } from "antd";
import { api, post, refreshCsrf } from "./api";
export default function GovLogin({ onLogin }: {onLogin:()=>void}) {
 const [config,setConfig]=useState<{mode:string;configured:boolean}>(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{api<typeof config>("/public/gov-auth").then(setConfig).catch(()=>{});},[]);
 if(config?.mode!=="central")return null;
 return <div style={{marginTop:16}}><Alert type="info" message="เจ้าหน้าที่เข้าใช้งานผ่าน Central Gov-Auth"/>
 {!config.configured?<Alert type="warning" message="ยังไม่ได้ตั้งค่าบริการส่วนกลาง"/>:<Form layout="vertical" onFinish={async v=>{setBusy(true);setError("");try{await post("/auth/gov",{accessToken:v.token});await refreshCsrf();onLogin();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
 <Form.Item name="token" label="Access Token จาก Gov กลาง" rules={[{required:true}]}><Input.Password autoComplete="off"/></Form.Item>
 {error&&<Alert type="error" message={error}/>}<Button block loading={busy} htmlType="submit">ยืนยันสิทธิ์ Gov กลาง</Button></Form>}
 </div>;
}
