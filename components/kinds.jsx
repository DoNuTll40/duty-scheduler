import { Shield, LogOut, Coffee, CircleHelp, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
export const KIND = {
  duty: { cls: 'st-duty', Icon: Shield }, withdraw: { cls: 'st-withdraw', Icon: LogOut },
  rest: { cls: 'st-rest', Icon: Coffee }, other: { cls: 'st-rest', Icon: CircleHelp },
};
export const SEV = {
  critical: { cls: 'st-bad', Icon: XCircle }, conflict: { cls: 'st-bad', Icon: XCircle },
  warning: { cls: 'st-warn', Icon: AlertTriangle }, info: { cls: 'st-rest', Icon: Info },
};
export { CheckCircle2 };
