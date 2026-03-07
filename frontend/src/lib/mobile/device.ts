import { hasPluginMethod, invokePlugin, getPlatform } from './capacitorBridge';

interface DeviceInfoResult {
    model?: string;
    operatingSystem?: string;
    osVersion?: string;
    platform?: string;
    manufacturer?: string;
    isVirtual?: boolean;
}

interface DeviceIdResult {
    identifier?: string;
}

export interface DeviceMetadata {
    model: string | null;
    osVersion: string | null;
    deviceId: string | null;
    platform: string;
    manufacturer: string | null;
    isVirtual: boolean;
}

export async function getDeviceMetadata(): Promise<DeviceMetadata> {
    if (!hasPluginMethod('Device', 'getInfo')) {
        return {
            model: null,
            osVersion: null,
            deviceId: null,
            platform: getPlatform(),
            manufacturer: null,
            isVirtual: false,
        };
    }

    const info = await invokePlugin<DeviceInfoResult>('Device', 'getInfo');
    const id = hasPluginMethod('Device', 'getId')
        ? await invokePlugin<DeviceIdResult>('Device', 'getId')
        : null;

    return {
        model: info.model ?? null,
        osVersion: info.osVersion ?? null,
        deviceId: id?.identifier ?? null,
        platform: info.platform ?? getPlatform(),
        manufacturer: info.manufacturer ?? null,
        isVirtual: Boolean(info.isVirtual),
    };
}
