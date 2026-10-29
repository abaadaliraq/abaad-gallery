import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {load} from './helpers/load-ts.mjs';
const require=createRequire(import.meta.url);
function harness(logout=async()=>({path:'',error:'اختبار'}),compact=false){
 const refs=[],state=[];let ri=0,si=0,calls=0;
 const Component=load('src/components/sections/LogoutButton.tsx',{
  react:{useRef:value=>refs[ri++]??(refs[ri-1]={current:value}),useId:()=> 'logout-title',useState:value=>{const i=si++;if(!(i in state))state[i]=value;return [state[i],next=>{state[i]=next;}];}},
  'react/jsx-runtime':require('react/jsx-runtime'),
  '@/lib/auth/actions':{logout:async()=>{calls++;return logout();}}
 }).default;
 const modal={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 function render(){ri=si=0;const tree=Component({compact});const [trigger,dialog]=tree.props.children;dialog.props.ref.current=modal;let focused=false;const [yes,no]=dialog.props.children[2].props.children;no.props.ref.current={focus(){focused=true;}};return {trigger,dialog,yes,no,focused:()=>focused};}
 return {render,modal,calls:()=>calls};
}
test('standard and compact logout open confirmation; No never signs out',()=>{
 for(const compact of [false,true]){
  const h=harness(undefined,compact),ui=h.render();assert.equal(h.modal.open,false);assert.equal(ui.trigger.props.type,'button');
  ui.trigger.props.onClick();assert.equal(h.modal.open,true);assert.equal(ui.focused(),true);assert.equal(h.calls(),0);
  assert.equal(ui.yes.props.children,'نعم');assert.equal(ui.no.props.children,'لا');
  ui.no.props.onClick();assert.equal(h.modal.open,false);assert.equal(h.calls(),0);
 }
});
test('confirmation is required and repeated Yes dispatches only one logout',async()=>{
 let release;const h=harness(()=>new Promise(resolve=>{release=resolve;})),ui=h.render();
 await ui.yes.props.onClick();assert.equal(h.calls(),0);
 ui.trigger.props.onClick();const pending=ui.yes.props.onClick();await ui.yes.props.onClick();assert.equal(h.calls(),1);
 const busy=h.render();assert.equal(busy.yes.props.disabled,true);assert.equal(busy.no.props.disabled,true);
 let prevented=false;busy.dialog.props.onCancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 busy.no.props.onClick();assert.equal(h.modal.open,true);
 release({path:'',error:'تعذر الخروج'});await pending;
});
test('connection failure keeps dialog open and allows retry without losing the session',async()=>{
 const h=harness(async()=>{throw Error('offline');});let ui=h.render();ui.trigger.props.onClick();await ui.yes.props.onClick();
 ui=h.render();assert.equal(h.modal.open,true);assert.equal(ui.yes.props.disabled,false);assert.equal(ui.dialog.props.children[1].props.role,'alert');
 assert.match(ui.dialog.props.children[1].props.children,/الاتصال/);ui.no.props.onClick();assert.equal(h.modal.open,false);
 let prevented=false;ui.dialog.props.onCancel({preventDefault(){prevented=true;}});assert.equal(prevented,false);
});
