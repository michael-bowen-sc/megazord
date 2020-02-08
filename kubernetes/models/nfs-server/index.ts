import * as k8s from '@jkcfg/kubernetes/api';
import { print } from '@jkcfg/std';
import { Number, Object, String } from '@jkcfg/std/param';
import { Component } from '@k8s/lib/component';
import { appNameSelector } from '@k8s/lib/labels';
import { image, name, namespace, port } from '@k8s/lib/parameters';
import { port as svcPort } from '@k8s/lib/snippets/service';
import { merge } from 'lodash-es';

export const params = {
  name: name('nfs-server'),
  namespace: namespace('default'),
  image: image('itsthenetwork/nfs-server-alpine:latest-arm'),
  clusterIP: String('clusterIP', '10.43.217.217'),
  port: port(2049),
  serviceType: String('serviceType', 'LoadBalancer'),
  hostPath: String('hostPath'),
  nodeSelector: Object('nodeSelector', {}),
  host: String('host', 'nfs.homestar.local'),
  replicas: Number('replicas', 3),
};

const nfsServer = p => {
  const config = merge(params, p);
  const {
    name,
    namespace,
    image,
    clusterIP,
    port,
    hostPath,
    nodeSelector,
    host,
    serviceType,
    replicas,
  } = config;
  const cmp = Component(name);
  const selector = appNameSelector(name);

  print(config, {});

  const svc = {
    path: 'service.yaml',
    value: new k8s.core.v1.Service(name, {
      metadata: { namespace },
      spec: {
        clusterIP,
        ports: [svcPort(port)],
        selector,
        type: serviceType,
      },
    }),
  };

  const deploy = {
    path: 'deployment.yaml',
    value: new k8s.apps.v1.Deployment(name, {
      metadata: { namespace },
      spec: {
        replicas,
        selector: {
          matchLabels: selector,
        },
        template: {
          metadata: {
            labels: selector,
          },
          spec: {
            nodeSelector,
            containers: [
              {
                name,
                image,
                imagePullPolicy: 'Always',
                ports: [{ containerPort: port }],
                securityContext: {
                  capabilities: {
                    add: ['SYS_ADMIN', 'SETPCAP'],
                  },
                },
                env: [{ name: 'SHARED_DIRECTORY', value: '/share' }],
                volumeMounts: [
                  {
                    mountPath: '/share',
                    name: 'host-volume',
                  },
                ],
              },
            ],
            volumes: [
              {
                name: 'host-volume',
                hostPath: {
                  path: hostPath,
                  type: 'Directory',
                },
              },
            ],
          },
        },
      },
    }),
  };

  const ing = {
    path: 'ingress.yaml',
    value: new k8s.extensions.v1beta1.Ingress(name, {
      metadata: { namespace },
      spec: {
        rules: [
          {
            host,
            http: {
              paths: [
                {
                  path: '/',
                  backend: {
                    serviceName: name,
                    servicePort: port,
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  };

  cmp.add([svc, deploy, ing]);

  return cmp.finalize();
};

export default nfsServer;
