import { Service, PlatformAccessory } from 'homebridge';
import http from 'http';
import { EufySecurityPlatform } from '../platform';

// import { HttpService, LocalLookupService, DeviceClientService, CommandType } from 'eufy-node-client';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore  
import { DoorbellCamera, Device } from 'eufy-security-client';
import { CameraAccessory } from './CameraAccessory';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class DoorbellCameraAccessory extends CameraAccessory {

  protected DoorbellCamera: DoorbellCamera;
  private ring_triggered: boolean;

  private doorbellService: Service;

  constructor(
    platform: EufySecurityPlatform,
    accessory: PlatformAccessory,
    eufyDevice: DoorbellCamera,
  ) {
    super(platform, accessory, eufyDevice);
    this.DoorbellCamera = eufyDevice;

    this.platform.log.debug(this.accessory.displayName, 'Constructed Doorbell');

    this.doorbellService =
      this.accessory.getService(this.platform.Service.Doorbell) ||
      this.accessory.addService(this.platform.Service.Doorbell);

    this.ring_triggered = false;

    // set the Battery service characteristics
    this.doorbellService.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.displayName,
    );

    // create handlers for required characteristics of Battery service
    this.doorbellService
      .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .onGet(() => null);

    this.DoorbellCamera.on('rings', (device: Device, state: boolean) =>
      this.onDeviceRingsPushNotification(),
    );

    this.doorbellService.setPrimaryService(true);
    this.initHttpEndpoint();

  }
  initHttpEndpoint() {
      const server = http.createServer();
      server.listen(8081);
      server.on('request', (request: http.IncomingMessage, response: http.ServerResponse) => {
        let results = {
          error: true,
          message: 'Malformed URL.'
        };
        if (request.url) {
          const spliturl = request.url.split('?');
          if (spliturl.length == 2) {
            const name = decodeURIComponent(spliturl[1]).split('=')[0];
            results = this.httpHandler(spliturl[0], name);
          }
        }
        response.writeHead(results.error ? 500 : 200);
        response.write(JSON.stringify(results));
        response.end();
      });
  }
  private httpHandler(fullpath: string, name: string) {
      const path = fullpath.split('/').filter((value) => value.length > 0);
      switch (path[0]) {
        case 'doorbell':
          this.doorbellService
            .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
            .updateValue(this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
          return {
            error: false,
            message: 'Doorbell switched on.'
          };;
          break;
        default:
          return {
            error: true,
            message: 'First directory level must be "motion" or "doorbell", got "' + path[0] + '".'
          };
      }
  }

  // We receive 2 push when Doorbell ring, mute the second by checking if we already send
  // the event to HK then reset the marker when 2nd times occurs
  private onDeviceRingsPushNotification(): void {
    if (!this.ring_triggered) {
      this.ring_triggered = true;
      this.platform.log.debug(this.accessory.displayName, 'DoorBell ringing');
      if (this.cameraConfig.useCachedLocalLivestream && this.streamingDelegate) {
        this.streamingDelegate.prepareCachedStream();
      }
      this.doorbellService
        .getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
        .updateValue(this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
    } else {
      this.ring_triggered = false;
    }
  }

}
