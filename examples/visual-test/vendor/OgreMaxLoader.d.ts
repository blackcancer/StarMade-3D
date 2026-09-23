import { Loader, Object3D } from "three";

export class OgreMaxLoader extends Loader<Object3D> {
  texturePath: string;
  load(
    url: string,
    onLoad?: (object: Object3D) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: Error) => void
  ): Promise<Object3D>;
}
