var push = [];
if (object.pushDeviceProfiles) {
  object.pushDeviceProfiles.forEach(function(it) {
    var p = JSON.parse(it);
    push.push(p.deviceName || p.uuid);
  });
}
var webauthn = [];
if (object.webauthnDeviceProfiles) {
  object.webauthnDeviceProfiles.forEach(function(it) {
    var p = JSON.parse(it);
    webauthn.push(p.deviceName || p.uuid);
  });
}
var oath = [];
if (object.oathDeviceProfiles) {
  object.oathDeviceProfiles.forEach(function(it) {
    var p = JSON.parse(it);
    oath.push(p.deviceName || p.uuid);
  });
}
var password = (object.password) ? true : false;
var email = (object.mail) ? true : false;
var email2 = (object.custom_mail2) ? true : false;
var sms = (object.telephoneNumber) ? true : false;
var value = {
  push,
  webauthn,
  oath,
  password,
  email,
  email2,
  sms
};
value;
