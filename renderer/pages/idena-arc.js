/* eslint-disable react/prop-types */
import React from 'react'
import {
  Badge,
  Box,
  Code,
  Flex,
  FormControl,
  FormHelperText,
  FormLabel,
  Grid,
  Heading,
  HStack,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@chakra-ui/react'
import Layout from '../shared/components/layout'
import {Page, PageTitle} from '../shared/components/components'
import {PrimaryButton, SecondaryButton} from '../shared/components/button'

const DEFAULT_ACTIONS = ['move_right', 'move_down', 'move_down'].join('\n')
const DEFAULT_RPC_URL = 'http://127.0.0.1:9009'

function getIdenaArcBridge() {
  return (
    global.idenaArc || {
      status: async () => ({ok: false}),
    }
  )
}

function parseActions(value) {
  return String(value || '')
    .split('\n')
    .map((line, index) => ({
      t_ms: index * 1000,
      action: line.trim(),
    }))
    .filter((item) => item.action)
}

function JsonBlock({value}) {
  if (!value) return null

  return (
    <Code
      display="block"
      w="full"
      whiteSpace="pre-wrap"
      borderRadius="md"
      p={4}
      colorScheme="gray"
      fontSize="xs"
      maxH="360px"
      overflowY="auto"
    >
      {JSON.stringify(value, null, 2)}
    </Code>
  )
}

function Field({label, children}) {
  return (
    <FormControl>
      <FormLabel mb={2} color="brandGray.500" fontWeight={500}>
        {label}
      </FormLabel>
      {children}
    </FormControl>
  )
}

export default function IdenaArcPage() {
  const toast = useToast()
  const [mounted, setMounted] = React.useState(false)
  const [busy, setBusy] = React.useState(null)
  const [adapter, setAdapter] = React.useState('external')
  const [proofMode, setProofMode] = React.useState('node-signature')
  const [rpcUrl, setRpcUrl] = React.useState(DEFAULT_RPC_URL)
  const [apiKey, setApiKey] = React.useState('')
  const [address, setAddress] = React.useState('')
  const [proofTxHash, setProofTxHash] = React.useState('')
  const [proofCid, setProofCid] = React.useState('')
  const [proofContract, setProofContract] = React.useState('')
  const [sessionId, setSessionId] = React.useState('')
  const [participantId, setParticipantId] = React.useState('player-1')
  const [salt, setSalt] = React.useState('')
  const [actions, setActions] = React.useState(DEFAULT_ACTIONS)
  const [status, setStatus] = React.useState(null)
  const [identity, setIdentity] = React.useState(null)
  const [session, setSession] = React.useState(null)
  const [game, setGame] = React.useState(null)
  const [bundle, setBundle] = React.useState(null)
  const [lastResult, setLastResult] = React.useState(null)
  const adapterTouchedRef = React.useRef(false)

  const applyStatus = React.useCallback((result) => {
    setStatus(result)

    const connection = result && result.rehearsalConnection
    if (!connection || !connection.url || adapterTouchedRef.current) {
      return
    }

    setAdapter('rehearsal-devnet')
    setProofMode('devnet-local-signature')
    setRpcUrl(connection.url)
    setApiKey(connection.apiKey || '')

    if (result.rehearsalSigner && result.rehearsalSigner.address) {
      setAddress(result.rehearsalSigner.address)
    }
  }, [])

  const basePayload = React.useMemo(
    () => ({
      adapter,
      proofMode,
      rpcUrl,
      apiKey,
      address,
      proofTxHash,
      proofCid,
      proofContract,
      participantId,
      sessionId,
    }),
    [
      adapter,
      proofMode,
      rpcUrl,
      apiKey,
      address,
      proofTxHash,
      proofCid,
      proofContract,
      participantId,
      sessionId,
    ]
  )

  const run = React.useCallback(
    async (label, action) => {
      setBusy(label)
      try {
        const result = await action()
        setLastResult(result)
        return result
      } catch (error) {
        const message = String(error && error.message ? error.message : error)
        toast({
          title: `${label} failed`,
          description: message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        })
        const failure = {
          ok: false,
          action: label,
          error: message,
        }
        setLastResult(failure)
        return failure
      } finally {
        setBusy(null)
      }
    },
    [toast]
  )

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    let ignore = false
    getIdenaArcBridge()
      .status()
      .then((result) => {
        if (!ignore) applyStatus(result)
      })
      .catch(() => {})

    return () => {
      ignore = true
    }
  }, [applyStatus])

  const handleResolveIdentity = React.useCallback(async () => {
    const result = await run('Resolve identity', () =>
      getIdenaArcBridge().resolveIdentity(basePayload)
    )
    setIdentity(result)
    if (!result || result.ok === false) return
    if (result && result.address) {
      setAddress(result.address)
    }
  }, [basePayload, run])

  const handleCreateSession = React.useCallback(async () => {
    const result = await run('Create session', () =>
      getIdenaArcBridge().createSession(basePayload)
    )
    if (!result || result.ok === false) return
    setSession(result)
    setSessionId(result.sessionId)
  }, [basePayload, run])

  const handleJoinSession = React.useCallback(async () => {
    const result = await run('Join session', () =>
      getIdenaArcBridge().joinSession(basePayload)
    )
    if (!result || result.ok === false) return
    setSession(result.session)
  }, [basePayload, run])

  const handleCommitSalt = React.useCallback(async () => {
    const result = await run('Commit salt', () =>
      getIdenaArcBridge().commitSalt(basePayload)
    )
    if (!result || result.ok === false) return
    setSalt(result.salt)
    setSession(result.session)
  }, [basePayload, run])

  const handleRevealSalt = React.useCallback(async () => {
    const result = await run('Reveal salt', () =>
      getIdenaArcBridge().revealSalt({...basePayload, salt})
    )
    if (!result || result.ok === false) return
    setSession(result.session)
  }, [basePayload, run, salt])

  const handleComputeSeed = React.useCallback(async () => {
    const result = await run('Compute seed', () =>
      getIdenaArcBridge().computeFinalSeed({
        ...basePayload,
        reveals: [{participantId, salt}],
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
  }, [basePayload, participantId, run, salt])

  const handleGenerateGame = React.useCallback(async () => {
    const result = await run('Generate game', () =>
      getIdenaArcBridge().generateGame({
        ...basePayload,
        reveals: [{participantId, salt}],
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    setGame(result.game)
  }, [basePayload, participantId, run, salt])

  const handleSubmitTrace = React.useCallback(async () => {
    const result = await run('Submit trace', () =>
      getIdenaArcBridge().submitTrace({
        ...basePayload,
        actions: parseActions(actions),
        feedback: {
          difficulty: 2,
          human_notes: 'MVP smoke trace',
        },
      })
    )
    if (!result || result.ok === false) return
    setSession(result.session)
    setBundle(result.bundle)
  }, [actions, basePayload, run])

  const pageContent = (
    <Page>
      <Flex w="full" align="flex-start" justify="space-between" gap={4}>
        <Box>
          <HStack spacing={3} mb={2}>
            <PageTitle mb={0}>IdenaArc</PageTitle>
            <Badge colorScheme="blue" borderRadius="full" px={2}>
              MVP
            </Badge>
          </HStack>
          <Text color="muted" maxW="760px">
            Rehearsal-first ARC-style sessions with local salt relay,
            deterministic replay, and Idena proof anchors. Private keys never go
            into the web interface.
          </Text>
        </Box>
        <SecondaryButton
          onClick={() => getIdenaArcBridge().status().then(applyStatus)}
        >
          Refresh
        </SecondaryButton>
      </Flex>

      <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full" mt={6}>
        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Identity
          </Heading>
          <Grid templateColumns={['1fr', '1fr 1fr']} gap={4}>
            <Field label="Adapter">
              <Select
                value={adapter}
                onChange={(e) => {
                  const nextAdapter = e.target.value
                  adapterTouchedRef.current = true
                  setAdapter(nextAdapter)
                  if (nextAdapter === 'rehearsal-devnet') {
                    setProofMode('devnet-local-signature')
                    if (status && status.rehearsalConnection) {
                      setRpcUrl(status.rehearsalConnection.url || '')
                      setApiKey(status.rehearsalConnection.apiKey || '')
                    }
                    if (
                      status &&
                      status.rehearsalSigner &&
                      status.rehearsalSigner.address
                    ) {
                      setAddress(status.rehearsalSigner.address)
                    }
                  } else if (proofMode === 'devnet-local-signature') {
                    setProofMode('node-signature')
                  }
                }}
              >
                <option value="external">External RPC</option>
                <option value="rehearsal-devnet">Rehearsal devnet</option>
              </Select>
            </Field>
            <Field label="Participant">
              <Input
                value={participantId}
                onChange={(e) => setParticipantId(e.target.value)}
              />
            </Field>
          </Grid>
          <Field label="Proof mode">
            <Select
              value={proofMode}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setProofMode(e.target.value)}
            >
              {adapter === 'rehearsal-devnet' ? (
                <option value="devnet-local-signature">
                  Devnet local signature
                </option>
              ) : null}
              <option value="node-signature">
                Local node signature (dna_sign)
              </option>
              <option value="tx-anchor">Tx/IPFS anchor proof</option>
            </Select>
            <FormHelperText>
              Private keys stay out of the renderer. Use local node signing for
              localhost RPC, or create an anchor payload for a classical tx /
              idena.social-style contract proof.
            </FormHelperText>
          </Field>
          <Field label="RPC URL">
            <Input
              value={rpcUrl}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setRpcUrl(e.target.value)}
            />
          </Field>
          <Field label="API key">
            <Input
              value={apiKey}
              isDisabled={adapter === 'rehearsal-devnet'}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </Field>
          <Field label="Address">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <FormHelperText>
              Leave empty with a local node and IdenaArc will ask
              dna_getCoinbaseAddr. Tx-anchor mode needs an explicit address.
            </FormHelperText>
          </Field>
          {proofMode === 'tx-anchor' ? (
            <Stack spacing={4}>
              <Field label="Proof tx hash">
                <Input
                  value={proofTxHash}
                  onChange={(e) => setProofTxHash(e.target.value)}
                  placeholder="optional after broadcast"
                />
              </Field>
              <Field label="Proof CID">
                <Input
                  value={proofCid}
                  onChange={(e) => setProofCid(e.target.value)}
                  placeholder="optional IPFS proof payload CID"
                />
              </Field>
              <Field label="Proof contract">
                <Input
                  value={proofContract}
                  onChange={(e) => setProofContract(e.target.value)}
                  placeholder="<idena-arc-proof-contract>"
                />
              </Field>
            </Stack>
          ) : null}
          <PrimaryButton
            alignSelf="flex-start"
            isLoading={busy === 'Resolve identity'}
            onClick={handleResolveIdentity}
          >
            Resolve identity
          </PrimaryButton>
          <JsonBlock value={identity} />
        </Stack>

        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Session
          </Heading>
          <Field label="Session ID">
            <Input
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
            />
          </Field>
          <HStack spacing={3} flexWrap="wrap">
            <PrimaryButton
              isLoading={busy === 'Create session'}
              onClick={handleCreateSession}
            >
              Create
            </PrimaryButton>
            <SecondaryButton
              isLoading={busy === 'Join session'}
              onClick={handleJoinSession}
              isDisabled={!sessionId}
            >
              Join
            </SecondaryButton>
          </HStack>
          <HStack spacing={3} flexWrap="wrap">
            <SecondaryButton
              isLoading={busy === 'Commit salt'}
              onClick={handleCommitSalt}
              isDisabled={!sessionId && !session}
            >
              Commit salt
            </SecondaryButton>
            <SecondaryButton
              isLoading={busy === 'Reveal salt'}
              onClick={handleRevealSalt}
              isDisabled={!salt}
            >
              Reveal salt
            </SecondaryButton>
            <SecondaryButton
              isLoading={busy === 'Compute seed'}
              onClick={handleComputeSeed}
              isDisabled={!salt}
            >
              Derive seed
            </SecondaryButton>
          </HStack>
          <Field label="Salt">
            <Input value={salt} onChange={(e) => setSalt(e.target.value)} />
          </Field>
          <JsonBlock value={session} />
        </Stack>
      </SimpleGrid>

      <SimpleGrid columns={[1, 1, 2]} spacing={6} w="full" mt={6}>
        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Game
          </Heading>
          <PrimaryButton
            alignSelf="flex-start"
            isLoading={busy === 'Generate game'}
            onClick={handleGenerateGame}
            isDisabled={!sessionId || !salt}
          >
            Generate
          </PrimaryButton>
          <JsonBlock value={game} />
        </Stack>

        <Stack spacing={5} bg="white" borderRadius="md" borderWidth="1px" p={5}>
          <Heading as="h2" fontSize="md" fontWeight={600}>
            Trace
          </Heading>
          <Field label="Actions">
            <Textarea
              minH="140px"
              value={actions}
              onChange={(e) => setActions(e.target.value)}
            />
          </Field>
          <PrimaryButton
            alignSelf="flex-start"
            isLoading={busy === 'Submit trace'}
            onClick={handleSubmitTrace}
            isDisabled={!game || (proofMode === 'tx-anchor' && !address)}
          >
            {proofMode === 'tx-anchor'
              ? 'Submit trace + proof draft'
              : 'Submit signed trace'}
          </PrimaryButton>
          <JsonBlock value={bundle} />
        </Stack>
      </SimpleGrid>

      <Stack spacing={4} w="full" mt={6}>
        <Heading as="h2" fontSize="md" fontWeight={600}>
          Runtime
        </Heading>
        <JsonBlock value={lastResult || status} />
      </Stack>
    </Page>
  )

  return mounted ? (
    <Layout syncing={false} offline={false} allowWhenNodeUnavailable>
      {pageContent}
    </Layout>
  ) : (
    <Box minH="100vh" bg="gray.50">
      {pageContent}
    </Box>
  )
}
