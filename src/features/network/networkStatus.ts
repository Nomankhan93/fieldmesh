export type ConnectionInputs = {
  internet: boolean
  radio: boolean
  gateway: boolean
}

export type ConnectionSummary = {
  title: string
  detail: string
  mode: 'internet' | 'radio' | 'hybrid' | 'offline'
  canCommunicate: boolean
}

export function describeConnection(inputs: ConnectionInputs): ConnectionSummary {
  if (inputs.internet) {
    return {
      title: 'Internet messaging is available',
      detail: 'ConnectX can synchronize chats through the Internet now.',
      mode: 'internet',
      canCommunicate: true,
    }
  }
  if (inputs.radio && inputs.gateway) {
    return {
      title: 'Hybrid messaging is available',
      detail: 'Internet is offline on this phone, but a radio path can reach a gateway.',
      mode: 'hybrid',
      canCommunicate: true,
    }
  }
  if (inputs.radio) {
    return {
      title: 'Local mesh messaging is available',
      detail: 'Internet is offline, but nearby ConnectX radio users can still be reachable.',
      mode: 'radio',
      canCommunicate: true,
    }
  }
  return {
    title: 'No live communication path is available',
    detail: 'Messages can remain stored locally until Internet or a compatible radio path returns.',
    mode: 'offline',
    canCommunicate: false,
  }
}
