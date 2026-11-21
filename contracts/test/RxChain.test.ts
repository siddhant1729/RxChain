import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { RxChain, RxChainHarness } from "../typechain-types";

const Role = { None: 0, Manufacturer: 1, Distributor: 2, Pharmacy: 3, Regulator: 4 } as const;
const Status = { Created: 0, InTransit: 1, Delivered: 2, Recalled: 3 } as const;
const Ev = {
  Created: 0,
  TransferInitiated: 1,
  TransferConfirmed: 2,
  TransferCancelled: 3,
  TransferRejected: 4,
  Recalled: 5,
  DocumentAttached: 6,
} as const;
const Verdict = {
  Genuine: 0,
  Counterfeit: 1,
  Suspicious: 2,
  Recalled: 3,
  Expired: 4,
  InSupplyChain: 5,
} as const;

const DAY = 24 * 60 * 60;
const DOC_HASH = ethers.sha256(ethers.toUtf8Bytes("certificate of analysis"));

async function deployFixture() {
  const [admin, m1, m2, d1, d2, p1, p2, outsider, reg2] = await ethers.getSigners();
  const factory = await ethers.getContractFactory("RxChain");
  const rx = (await factory.deploy("Drug Regulator", "REG-001", "New Delhi")) as unknown as RxChain;
  await rx.waitForDeployment();

  await rx.registerParticipant(m1.address, Role.Manufacturer, "Sun Pharma Ltd", "MFG-1", "Mumbai");
  await rx.registerParticipant(m2.address, Role.Manufacturer, "Cipla Ltd", "MFG-2", "Mumbai");
  await rx.registerParticipant(d1.address, Role.Distributor, "MedLine", "DST-1", "Delhi");
  await rx.registerParticipant(d2.address, Role.Distributor, "HealthKart", "DST-2", "Gurugram");
  await rx.registerParticipant(p1.address, Role.Pharmacy, "Apollo Noida", "PH-1", "Noida");
  await rx.registerParticipant(p2.address, Role.Pharmacy, "City Care", "PH-2", "Noida");
  await rx.registerParticipant(reg2.address, Role.Regulator, "State FDA", "REG-002", "Lucknow");

  const now = await time.latest();
  const mfg = now - DAY;
  const exp = now + 365 * DAY;

  async function create(batchNumber = "B-001", signer = m1, docHash = ethers.ZeroHash) {
    await rx.connect(signer).createBatch("Paracetamol 500mg", batchNumber, mfg, exp, 1000, docHash);
    return rx.computeBatchId(signer.address, batchNumber);
  }

  return { rx, admin, m1, m2, d1, d2, p1, p2, outsider, reg2, mfg, exp, create };
}

async function verdictOf(rx: RxChain, id: string) {
  const [v] = await rx.verifyBatch(id);
  return Number(v);
}

describe("RxChain", () => {
  describe("deployment", () => {
    it("grants deployer admin + regulator and registers them", async () => {
      const { rx, admin } = await loadFixture(deployFixture);
      expect(await rx.hasRole(await rx.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await rx.hasRole(await rx.REGULATOR_ROLE(), admin.address)).to.equal(true);
      const p = await rx.getParticipant(admin.address);
      expect(p.role).to.equal(Role.Regulator);
      expect(p.name).to.equal("Drug Regulator");
      expect(p.active).to.equal(true);
    });
  });

  describe("participant registry", () => {
    it("registers participants, grants roles and emits event", async () => {
      const { rx, outsider } = await loadFixture(deployFixture);
      await expect(
        rx.registerParticipant(outsider.address, Role.Pharmacy, "New Chemist", "PH-9", "Agra"),
      )
        .to.emit(rx, "ParticipantRegistered")
        .withArgs(outsider.address, Role.Pharmacy, "New Chemist", "PH-9", "Agra");
      expect(await rx.hasRole(await rx.PHARMACY_ROLE(), outsider.address)).to.equal(true);
      expect(await rx.isActiveParticipant(outsider.address)).to.equal(true);
    });

    it("grants the correct role for every role type", async () => {
      const { rx, m1, d1, p1, reg2 } = await loadFixture(deployFixture);
      expect(await rx.hasRole(await rx.MANUFACTURER_ROLE(), m1.address)).to.equal(true);
      expect(await rx.hasRole(await rx.DISTRIBUTOR_ROLE(), d1.address)).to.equal(true);
      expect(await rx.hasRole(await rx.PHARMACY_ROLE(), p1.address)).to.equal(true);
      expect(await rx.hasRole(await rx.REGULATOR_ROLE(), reg2.address)).to.equal(true);
    });

    it("lists all participants in order", async () => {
      const { rx, admin, m1, reg2 } = await loadFixture(deployFixture);
      const all = await rx.getAllParticipants();
      expect(all.length).to.equal(8);
      expect(all[0].account).to.equal(admin.address);
      expect(all[1].account).to.equal(m1.address);
      expect(all[7].account).to.equal(reg2.address);
    });

    it("returns an empty record for unregistered addresses", async () => {
      const { rx, outsider } = await loadFixture(deployFixture);
      const p = await rx.getParticipant(outsider.address);
      expect(p.role).to.equal(Role.None);
      expect(await rx.isActiveParticipant(outsider.address)).to.equal(false);
    });

    it("only admin can register", async () => {
      const { rx, m1, outsider } = await loadFixture(deployFixture);
      await expect(
        rx.connect(m1).registerParticipant(outsider.address, Role.Pharmacy, "X", "L", "Y"),
      ).to.be.revertedWithCustomError(rx, "AccessControlUnauthorizedAccount");
    });

    it("rejects zero address, None role, empty fields and duplicates", async () => {
      const { rx, m1, outsider } = await loadFixture(deployFixture);
      await expect(
        rx.registerParticipant(ethers.ZeroAddress, Role.Pharmacy, "X", "L", "Y"),
      ).to.be.revertedWithCustomError(rx, "ZeroAddress");
      await expect(
        rx.registerParticipant(outsider.address, Role.None, "X", "L", "Y"),
      ).to.be.revertedWithCustomError(rx, "InvalidRole");
      await expect(
        rx.registerParticipant(outsider.address, Role.Pharmacy, "", "L", "Y"),
      ).to.be.revertedWithCustomError(rx, "EmptyField");
      await expect(
        rx.registerParticipant(outsider.address, Role.Pharmacy, "X", "", "Y"),
      ).to.be.revertedWithCustomError(rx, "EmptyField");
      await expect(rx.registerParticipant(m1.address, Role.Pharmacy, "X", "L", "Y"))
        .to.be.revertedWithCustomError(rx, "AlreadyRegistered")
        .withArgs(m1.address);
    });

    it("admin can suspend and reactivate; emits event", async () => {
      const { rx, d1 } = await loadFixture(deployFixture);
      await expect(rx.setParticipantActive(d1.address, false))
        .to.emit(rx, "ParticipantStatusChanged")
        .withArgs(d1.address, false);
      expect(await rx.isActiveParticipant(d1.address)).to.equal(false);
      await rx.setParticipantActive(d1.address, true);
      expect(await rx.isActiveParticipant(d1.address)).to.equal(true);
    });

    it("only admin can suspend; unknown addresses revert", async () => {
      const { rx, m1, d1, outsider } = await loadFixture(deployFixture);
      await expect(
        rx.connect(m1).setParticipantActive(d1.address, false),
      ).to.be.revertedWithCustomError(rx, "AccessControlUnauthorizedAccount");
      await expect(rx.setParticipantActive(outsider.address, false))
        .to.be.revertedWithCustomError(rx, "NotRegistered")
        .withArgs(outsider.address);
    });

    it("revoking the AccessControl role deactivates a participant", async () => {
      const { rx, d1 } = await loadFixture(deployFixture);
      await rx.revokeRole(await rx.DISTRIBUTOR_ROLE(), d1.address);
      expect(await rx.isActiveParticipant(d1.address)).to.equal(false);
    });
  });

  describe("createBatch", () => {
    it("creates a batch with correct fields, history and indexes", async () => {
      const { rx, m1, mfg, exp } = await loadFixture(deployFixture);
      const id = await rx.computeBatchId(m1.address, "B-001");
      await expect(
        rx.connect(m1).createBatch("Paracetamol 500mg", "B-001", mfg, exp, 1000, DOC_HASH),
      )
        .to.emit(rx, "BatchCreated")
        .withArgs(id, m1.address, "Paracetamol 500mg", "B-001", exp, 1000, DOC_HASH);

      expect(id).to.equal(
        ethers.solidityPackedKeccak256(["address", "string"], [m1.address, "B-001"]),
      );
      const b = await rx.getBatch(id);
      expect(b.exists).to.equal(true);
      expect(b.id).to.equal(id);
      expect(b.drugName).to.equal("Paracetamol 500mg");
      expect(b.manufacturerName).to.equal("Sun Pharma Ltd");
      expect(b.manufacturer).to.equal(m1.address);
      expect(b.currentOwner).to.equal(m1.address);
      expect(b.pendingOwner).to.equal(ethers.ZeroAddress);
      expect(b.status).to.equal(Status.Created);
      expect(b.docHash).to.equal(DOC_HASH);
      expect(b.quantity).to.equal(1000n);
      expect(await rx.totalBatches()).to.equal(1n);
      expect(await rx.getAllBatchIds()).to.deep.equal([id]);
      expect(await rx.getBatchesByOwner(m1.address)).to.deep.equal([id]);
      expect(await rx.getBatchesByManufacturer(m1.address)).to.deep.equal([id]);

      const h = await rx.getHistory(id);
      expect(h.length).to.equal(1);
      expect(h[0].eventType).to.equal(Ev.Created);
      expect(h[0].from).to.equal(ethers.ZeroAddress);
      expect(h[0].to).to.equal(m1.address);
    });

    it("reverts on duplicate batch number for the same manufacturer", async () => {
      const { rx, m1, create } = await loadFixture(deployFixture);
      const id = await create("B-001");
      await expect(create("B-001"))
        .to.be.revertedWithCustomError(rx, "BatchAlreadyExists")
        .withArgs(id);
      expect(m1.address).to.not.equal(ethers.ZeroAddress);
    });

    it("allows the same batch number for a different manufacturer", async () => {
      const { rx, m1, m2, create } = await loadFixture(deployFixture);
      const a = await create("B-001", m1);
      const b = await create("B-001", m2);
      expect(a).to.not.equal(b);
      expect(await rx.totalBatches()).to.equal(2n);
    });

    it("validates dates, quantity and required fields", async () => {
      const { rx, m1, mfg, exp } = await loadFixture(deployFixture);
      const now = await time.latest();
      const c = rx.connect(m1);
      await expect(c.createBatch("D", "X1", exp, mfg, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "InvalidDates",
      );
      await expect(c.createBatch("D", "X2", mfg, mfg, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "InvalidDates",
      );
      await expect(
        c.createBatch("D", "X3", now - 10 * DAY, now - DAY, 1, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(rx, "InvalidDates");
      await expect(
        c.createBatch("D", "X4", now + 10 * DAY, now + 400 * DAY, 1, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(rx, "InvalidDates");
      await expect(c.createBatch("D", "X5", mfg, exp, 0, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "InvalidQuantity",
      );
      await expect(c.createBatch("", "X6", mfg, exp, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "EmptyField",
      );
      await expect(c.createBatch("D", "", mfg, exp, 1, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "EmptyField",
      );
    });

    it("is restricted to active manufacturers", async () => {
      const { rx, d1, p1, outsider, admin, m1, mfg, exp } = await loadFixture(deployFixture);
      for (const s of [d1, p1, admin]) {
        await expect(
          rx.connect(s).createBatch("D", "X", mfg, exp, 1, ethers.ZeroHash),
        ).to.be.revertedWithCustomError(rx, "AccessControlUnauthorizedAccount");
      }
      await expect(
        rx.connect(outsider).createBatch("D", "X", mfg, exp, 1, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(rx, "NotActiveParticipant");
      await rx.setParticipantActive(m1.address, false);
      await expect(rx.connect(m1).createBatch("D", "X", mfg, exp, 1, ethers.ZeroHash))
        .to.be.revertedWithCustomError(rx, "NotActiveParticipant")
        .withArgs(m1.address);
    });
  });

  describe("full happy path M -> D -> P", () => {
    it("moves custody with the correct verdict at every stage", async () => {
      const { rx, m1, d1, p1, create } = await loadFixture(deployFixture);
      const id = await create();
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);

      await expect(rx.connect(m1).initiateTransfer(id, d1.address, "INV-1"))
        .to.emit(rx, "TransferInitiated")
        .withArgs(id, m1.address, d1.address, "INV-1");
      let b = await rx.getBatch(id);
      expect(b.status).to.equal(Status.InTransit);
      expect(b.pendingOwner).to.equal(d1.address);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([id]);
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);

      await expect(rx.connect(d1).confirmReceipt(id))
        .to.emit(rx, "TransferConfirmed")
        .withArgs(id, m1.address, d1.address);
      b = await rx.getBatch(id);
      expect(b.currentOwner).to.equal(d1.address);
      expect(b.status).to.equal(Status.Created);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([]);
      expect(await rx.getBatchesByOwner(m1.address)).to.deep.equal([]);
      expect(await rx.getBatchesByOwner(d1.address)).to.deep.equal([id]);
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);

      await rx.connect(d1).initiateTransfer(id, p1.address, "INV-2");
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);
      await rx.connect(p1).confirmReceipt(id);
      b = await rx.getBatch(id);
      expect(b.currentOwner).to.equal(p1.address);
      expect(b.status).to.equal(Status.Delivered);

      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Genuine);
      expect(reason).to.contain("licensed pharmacy");
      // manufacturer index is permanent
      expect(await rx.getBatchesByManufacturer(m1.address)).to.deep.equal([id]);
    });

    it("records history with the right length, order and fields", async () => {
      const { rx, m1, d1, p1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "INV-1");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, p1.address, "INV-2");
      await rx.connect(p1).confirmReceipt(id);

      const h = await rx.getHistory(id);
      expect(h.length).to.equal(5);
      expect(h.map((e) => Number(e.eventType))).to.deep.equal([
        Ev.Created,
        Ev.TransferInitiated,
        Ev.TransferConfirmed,
        Ev.TransferInitiated,
        Ev.TransferConfirmed,
      ]);
      expect([h[1].from, h[1].to, h[1].note]).to.deep.equal([m1.address, d1.address, "INV-1"]);
      expect([h[2].from, h[2].to]).to.deep.equal([m1.address, d1.address]);
      expect([h[3].from, h[3].to, h[3].note]).to.deep.equal([d1.address, p1.address, "INV-2"]);
      expect([h[4].from, h[4].to]).to.deep.equal([d1.address, p1.address]);
      for (let i = 1; i < h.length; i++) {
        expect(h[i].timestamp >= h[i - 1].timestamp).to.equal(true);
      }
    });

    it("supports distributor -> distributor hops", async () => {
      const { rx, m1, d1, d2, p2, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, d2.address, "regional hub");
      await rx.connect(d2).confirmReceipt(id);
      expect((await rx.getBatch(id)).status).to.equal(Status.Created);
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);
      await rx.connect(d2).initiateTransfer(id, p2.address, "");
      await rx.connect(p2).confirmReceipt(id);
      expect(await verdictOf(rx, id)).to.equal(Verdict.Genuine);
      expect((await rx.getHistory(id)).length).to.equal(7);
    });

    it("keeps owner/incoming sets correct with many batches (swap-and-pop)", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const a = await create("A");
      const b = await create("B");
      const c = await create("C");
      for (const id of [a, b, c]) await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(a);
      expect([...(await rx.getPendingIncoming(d1.address))].sort()).to.deep.equal([b, c].sort());
      expect([...(await rx.getBatchesByOwner(m1.address))].sort()).to.deep.equal([b, c].sort());
      await rx.connect(d1).confirmReceipt(c);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([b]);
      expect(await rx.getBatchesByOwner(m1.address)).to.deep.equal([b]);
      expect([...(await rx.getBatchesByOwner(d1.address))].sort()).to.deep.equal([a, c].sort());
    });
  });

  describe("illegal flows", () => {
    it("blocks manufacturer -> pharmacy directly", async () => {
      const { rx, m1, p1, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).initiateTransfer(id, p1.address, ""))
        .to.be.revertedWithCustomError(rx, "InvalidTransferRoute")
        .withArgs(Role.Manufacturer, Role.Pharmacy);
    });

    it("blocks manufacturer -> manufacturer and -> regulator", async () => {
      const { rx, m1, m2, reg2, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).initiateTransfer(id, m2.address, "")).to.be.revertedWithCustomError(
        rx,
        "InvalidTransferRoute",
      );
      await expect(
        rx.connect(m1).initiateTransfer(id, reg2.address, ""),
      ).to.be.revertedWithCustomError(rx, "InvalidTransferRoute");
    });

    it("blocks distributor -> manufacturer", async () => {
      const { rx, m1, m2, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await expect(rx.connect(d1).initiateTransfer(id, m2.address, ""))
        .to.be.revertedWithCustomError(rx, "InvalidTransferRoute")
        .withArgs(Role.Distributor, Role.Manufacturer);
    });

    it("blocks pharmacy -> anyone (end of chain)", async () => {
      const { rx, m1, d1, p1, p2, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, p1.address, "");
      await rx.connect(p1).confirmReceipt(id);
      await expect(rx.connect(p1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "InvalidTransferRoute")
        .withArgs(Role.Pharmacy, Role.Distributor);
      await expect(rx.connect(p1).initiateTransfer(id, p2.address, ""))
        .to.be.revertedWithCustomError(rx, "InvalidTransferRoute")
        .withArgs(Role.Pharmacy, Role.Pharmacy);
    });

    it("blocks transfer to an unregistered address, zero address or self", async () => {
      const { rx, m1, outsider, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).initiateTransfer(id, outsider.address, ""))
        .to.be.revertedWithCustomError(rx, "ReceiverNotActive")
        .withArgs(outsider.address);
      await expect(
        rx.connect(m1).initiateTransfer(id, ethers.ZeroAddress, ""),
      ).to.be.revertedWithCustomError(rx, "ZeroAddress");
      await expect(rx.connect(m1).initiateTransfer(id, m1.address, "")).to.be.revertedWithCustomError(
        rx,
        "SelfTransfer",
      );
    });

    it("blocks transfer to a suspended participant", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.setParticipantActive(d1.address, false);
      await expect(rx.connect(m1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "ReceiverNotActive")
        .withArgs(d1.address);
    });

    it("blocks a non-owner initiating", async () => {
      const { rx, m2, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m2).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "NotCurrentOwner")
        .withArgs(m2.address);
      await expect(rx.connect(d1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "NotCurrentOwner")
        .withArgs(d1.address);
    });

    it("blocks a suspended owner initiating", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.setParticipantActive(m1.address, false);
      await expect(rx.connect(m1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "NotActiveParticipant")
        .withArgs(m1.address);
    });

    it("blocks a non-pending address confirming", async () => {
      const { rx, m1, d1, d2, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(d1).confirmReceipt(id))
        .to.be.revertedWithCustomError(rx, "NoPendingTransfer")
        .withArgs(id);
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(d2).confirmReceipt(id))
        .to.be.revertedWithCustomError(rx, "NotPendingOwner")
        .withArgs(d2.address);
      await expect(rx.connect(m1).confirmReceipt(id))
        .to.be.revertedWithCustomError(rx, "NotPendingOwner")
        .withArgs(m1.address);
    });

    it("blocks a suspended pending owner confirming", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.setParticipantActive(d1.address, false);
      await expect(rx.connect(d1).confirmReceipt(id)).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
    });

    it("blocks a double initiate", async () => {
      const { rx, m1, d1, d2, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(m1).initiateTransfer(id, d2.address, ""))
        .to.be.revertedWithCustomError(rx, "TransferAlreadyPending")
        .withArgs(id);
    });

    it("reverts every batch function for an unknown batch ID", async () => {
      const { rx, m1, d1, admin } = await loadFixture(deployFixture);
      const bogus = ethers.keccak256(ethers.toUtf8Bytes("nope"));
      await expect(rx.connect(m1).initiateTransfer(bogus, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "BatchNotFound")
        .withArgs(bogus);
      await expect(rx.connect(d1).confirmReceipt(bogus)).to.be.revertedWithCustomError(
        rx,
        "BatchNotFound",
      );
      await expect(rx.connect(d1).rejectTransfer(bogus, "x")).to.be.revertedWithCustomError(
        rx,
        "BatchNotFound",
      );
      await expect(rx.connect(m1).cancelTransfer(bogus)).to.be.revertedWithCustomError(
        rx,
        "BatchNotFound",
      );
      await expect(rx.connect(admin).recallBatch(bogus, "x")).to.be.revertedWithCustomError(
        rx,
        "BatchNotFound",
      );
      await expect(rx.connect(m1).attachDocument(bogus, DOC_HASH)).to.be.revertedWithCustomError(
        rx,
        "BatchNotFound",
      );
    });
  });

  describe("reject and cancel", () => {
    it("reject by the pending owner restores state", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(d1).rejectTransfer(id, "Damaged cartons"))
        .to.emit(rx, "TransferRejected")
        .withArgs(id, d1.address, m1.address, "Damaged cartons");
      const b = await rx.getBatch(id);
      expect(b.status).to.equal(Status.Created);
      expect(b.pendingOwner).to.equal(ethers.ZeroAddress);
      expect(b.currentOwner).to.equal(m1.address);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([]);
      const h = await rx.getHistory(id);
      expect(h[h.length - 1].eventType).to.equal(Ev.TransferRejected);
      expect(h[h.length - 1].note).to.equal("Damaged cartons");
      // can be re-sent afterwards
      await rx.connect(m1).initiateTransfer(id, d1.address, "retry");
      expect((await rx.getBatch(id)).pendingOwner).to.equal(d1.address);
    });

    it("reject is gated to the pending owner", async () => {
      const { rx, m1, d1, d2, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(d1).rejectTransfer(id, "x")).to.be.revertedWithCustomError(
        rx,
        "NoPendingTransfer",
      );
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(d2).rejectTransfer(id, "x"))
        .to.be.revertedWithCustomError(rx, "NotPendingOwner")
        .withArgs(d2.address);
      await rx.setParticipantActive(d1.address, false);
      await expect(rx.connect(d1).rejectTransfer(id, "x")).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
    });

    it("cancel by the current owner restores state", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(m1).cancelTransfer(id))
        .to.emit(rx, "TransferCancelled")
        .withArgs(id, m1.address, d1.address);
      const b = await rx.getBatch(id);
      expect(b.status).to.equal(Status.Created);
      expect(b.pendingOwner).to.equal(ethers.ZeroAddress);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([]);
      const h = await rx.getHistory(id);
      expect(h[h.length - 1].eventType).to.equal(Ev.TransferCancelled);
      await expect(rx.connect(d1).confirmReceipt(id)).to.be.revertedWithCustomError(
        rx,
        "NoPendingTransfer",
      );
    });

    it("cancel is gated to the current owner with a pending transfer", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).cancelTransfer(id))
        .to.be.revertedWithCustomError(rx, "NoPendingTransfer")
        .withArgs(id);
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await expect(rx.connect(d1).cancelTransfer(id))
        .to.be.revertedWithCustomError(rx, "NotCurrentOwner")
        .withArgs(d1.address);
      await rx.setParticipantActive(m1.address, false);
      await expect(rx.connect(m1).cancelTransfer(id)).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
    });
  });

  describe("recall", () => {
    it("manufacturer can recall; verdict becomes Recalled", async () => {
      const { rx, m1, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).recallBatch(id, "Contamination detected in QC"))
        .to.emit(rx, "BatchRecalled")
        .withArgs(id, m1.address, "Contamination detected in QC");
      const b = await rx.getBatch(id);
      expect(b.status).to.equal(Status.Recalled);
      expect(b.recallReason).to.equal("Contamination detected in QC");
      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Recalled);
      expect(reason).to.contain("Contamination detected in QC");
    });

    it("any regulator can recall a delivered batch", async () => {
      const { rx, m1, d1, p1, reg2, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, p1.address, "");
      await rx.connect(p1).confirmReceipt(id);
      expect(await verdictOf(rx, id)).to.equal(Verdict.Genuine);
      await rx.connect(reg2).recallBatch(id, "Regulatory action");
      expect(await verdictOf(rx, id)).to.equal(Verdict.Recalled);
      const h = await rx.getHistory(id);
      expect(h[h.length - 1].eventType).to.equal(Ev.Recalled);
      expect(h[h.length - 1].from).to.equal(reg2.address);
    });

    it("recall during transit clears the pending transfer", async () => {
      const { rx, admin, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(admin).recallBatch(id, "Recall");
      const b = await rx.getBatch(id);
      expect(b.pendingOwner).to.equal(ethers.ZeroAddress);
      expect(await rx.getPendingIncoming(d1.address)).to.deep.equal([]);
      await expect(rx.connect(d1).confirmReceipt(id)).to.be.revertedWithCustomError(
        rx,
        "NoPendingTransfer",
      );
    });

    it("a recalled batch cannot move and recall is irreversible", async () => {
      const { rx, m1, d1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).recallBatch(id, "Bad");
      await expect(rx.connect(m1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "BatchIsRecalled")
        .withArgs(id);
      await expect(rx.connect(m1).recallBatch(id, "Again"))
        .to.be.revertedWithCustomError(rx, "BatchIsRecalled")
        .withArgs(id);
    });

    it("only the batch manufacturer or a regulator can recall", async () => {
      const { rx, m1, m2, d1, p1, outsider, create } = await loadFixture(deployFixture);
      const id = await create();
      for (const s of [m2, d1, p1]) {
        await expect(rx.connect(s).recallBatch(id, "x"))
          .to.be.revertedWithCustomError(rx, "NotAuthorizedToRecall")
          .withArgs(s.address);
      }
      await expect(rx.connect(outsider).recallBatch(id, "x")).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
      await expect(rx.connect(m1).recallBatch(id, "")).to.be.revertedWithCustomError(
        rx,
        "EmptyField",
      );
    });

    it("suspended manufacturer and suspended regulator cannot recall", async () => {
      const { rx, m1, reg2, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.setParticipantActive(m1.address, false);
      await rx.setParticipantActive(reg2.address, false);
      await expect(rx.connect(m1).recallBatch(id, "x")).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
      await expect(rx.connect(reg2).recallBatch(id, "x")).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
    });
  });

  describe("documents", () => {
    it("manufacturer can attach a document hash", async () => {
      const { rx, m1, create } = await loadFixture(deployFixture);
      const id = await create();
      await expect(rx.connect(m1).attachDocument(id, DOC_HASH))
        .to.emit(rx, "DocumentAttached")
        .withArgs(id, m1.address, DOC_HASH);
      expect((await rx.getBatch(id)).docHash).to.equal(DOC_HASH);
      const h = await rx.getHistory(id);
      expect(h[h.length - 1].eventType).to.equal(Ev.DocumentAttached);
      expect(h[h.length - 1].note).to.equal(DOC_HASH);
    });

    it("rejects non-manufacturers, zero hash and suspended manufacturers", async () => {
      const { rx, m1, m2, d1, admin, create } = await loadFixture(deployFixture);
      const id = await create();
      for (const s of [m2, d1, admin]) {
        await expect(rx.connect(s).attachDocument(id, DOC_HASH))
          .to.be.revertedWithCustomError(rx, "NotBatchManufacturer")
          .withArgs(s.address);
      }
      await expect(rx.connect(m1).attachDocument(id, ethers.ZeroHash)).to.be.revertedWithCustomError(
        rx,
        "InvalidDocHash",
      );
      await rx.setParticipantActive(m1.address, false);
      await expect(rx.connect(m1).attachDocument(id, DOC_HASH)).to.be.revertedWithCustomError(
        rx,
        "NotActiveParticipant",
      );
    });
  });

  describe("expiry", () => {
    it("verdict becomes Expired and transfers are blocked", async () => {
      const { rx, m1, d1, exp, create } = await loadFixture(deployFixture);
      const id = await create();
      await time.increaseTo(exp + 1);
      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Expired);
      expect(reason).to.contain("expiry");
      await expect(rx.connect(m1).initiateTransfer(id, d1.address, ""))
        .to.be.revertedWithCustomError(rx, "BatchIsExpired")
        .withArgs(id);
    });

    it("an in-transit batch that expires cannot be confirmed but can be rejected", async () => {
      const { rx, m1, d1, exp, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await time.increaseTo(exp + 1);
      await expect(rx.connect(d1).confirmReceipt(id)).to.be.revertedWithCustomError(
        rx,
        "BatchIsExpired",
      );
      await rx.connect(d1).rejectTransfer(id, "Arrived expired");
      expect((await rx.getBatch(id)).currentOwner).to.equal(m1.address);
    });

    it("recalled takes precedence over expired", async () => {
      const { rx, m1, exp, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).recallBatch(id, "Bad");
      await time.increaseTo(exp + 1);
      expect(await verdictOf(rx, id)).to.equal(Verdict.Recalled);
    });
  });

  describe("verifyBatch", () => {
    it("returns Counterfeit for a random bytes32", async () => {
      const { rx } = await loadFixture(deployFixture);
      const [v, reason] = await rx.verifyBatch(ethers.hexlify(ethers.randomBytes(32)));
      expect(v).to.equal(Verdict.Counterfeit);
      expect(reason).to.equal("Batch ID not found on chain");
    });

    it("returns Suspicious if the manufacturer is suspended", async () => {
      const { rx, m1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.setParticipantActive(m1.address, false);
      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Suspicious);
      expect(reason).to.contain("Manufacturer");
    });

    it("returns Suspicious if the manufacturer role is revoked", async () => {
      const { rx, m1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.revokeRole(await rx.MANUFACTURER_ROLE(), m1.address);
      expect(await verdictOf(rx, id)).to.equal(Verdict.Suspicious);
    });

    it("returns Suspicious if the holding pharmacy is suspended", async () => {
      const { rx, m1, d1, p1, create } = await loadFixture(deployFixture);
      const id = await create();
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, p1.address, "");
      await rx.connect(p1).confirmReceipt(id);
      await rx.setParticipantActive(p1.address, false);
      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Suspicious);
      expect(reason).to.contain("custodian");
    });
  });

  describe("history integrity check (harness)", () => {
    async function harnessFixture() {
      const [admin, m1, d1, p1] = await ethers.getSigners();
      const factory = await ethers.getContractFactory("RxChainHarness");
      const rx = (await factory.deploy()) as unknown as RxChainHarness;
      await rx.registerParticipant(m1.address, Role.Manufacturer, "M", "M1", "X");
      await rx.registerParticipant(d1.address, Role.Distributor, "D", "D1", "X");
      await rx.registerParticipant(p1.address, Role.Pharmacy, "P", "P1", "X");
      const now = await time.latest();
      await rx.connect(m1).createBatch("Drug", "H-1", now - DAY, now + 100 * DAY, 10, ethers.ZeroHash);
      const id = await rx.computeBatchId(m1.address, "H-1");
      await rx.connect(m1).initiateTransfer(id, d1.address, "");
      await rx.connect(d1).confirmReceipt(id);
      await rx.connect(d1).initiateTransfer(id, p1.address, "");
      await rx.connect(p1).confirmReceipt(id);
      return { rx, admin, m1, d1, p1, id };
    }

    it("is Genuine before tampering", async () => {
      const { rx, id } = await loadFixture(harnessFixture);
      expect(Number((await rx.verifyBatch(id))[0])).to.equal(Verdict.Genuine);
    });

    it("detects a TransferConfirmed whose from is not the previous owner", async () => {
      const { rx, id, p1 } = await loadFixture(harnessFixture);
      await rx.corruptHistoryFrom(id, 2, p1.address);
      const [v, reason] = await rx.verifyBatch(id);
      expect(v).to.equal(Verdict.Suspicious);
      expect(reason).to.contain("inconsistent");
    });

    it("detects a forged Created event after the first entry", async () => {
      const { rx, id, p1 } = await loadFixture(harnessFixture);
      await rx.injectCreatedEvent(id, p1.address);
      expect(Number((await rx.verifyBatch(id))[0])).to.equal(Verdict.Suspicious);
    });

    it("detects a missing history", async () => {
      const { rx, id } = await loadFixture(harnessFixture);
      await rx.wipeHistory(id);
      expect(Number((await rx.verifyBatch(id))[0])).to.equal(Verdict.Suspicious);
    });
  });

  describe("pause", () => {
    it("only admin can pause/unpause", async () => {
      const { rx, m1 } = await loadFixture(deployFixture);
      await expect(rx.connect(m1).pause()).to.be.revertedWithCustomError(
        rx,
        "AccessControlUnauthorizedAccount",
      );
      await rx.pause();
      await expect(rx.connect(m1).unpause()).to.be.revertedWithCustomError(
        rx,
        "AccessControlUnauthorizedAccount",
      );
    });

    it("pause blocks every batch write and unpause restores them", async () => {
      const { rx, admin, m1, d1, mfg, exp, create } = await loadFixture(deployFixture);
      const id = await create();
      const id2 = await create("B-002");
      await rx.connect(m1).initiateTransfer(id2, d1.address, "");
      await expect(rx.pause()).to.emit(rx, "Paused").withArgs(admin.address);
      expect(await rx.paused()).to.equal(true);

      const E = "EnforcedPause";
      await expect(
        rx.connect(m1).createBatch("D", "P-1", mfg, exp, 1, ethers.ZeroHash),
      ).to.be.revertedWithCustomError(rx, E);
      await expect(rx.connect(m1).initiateTransfer(id, d1.address, "")).to.be.revertedWithCustomError(
        rx,
        E,
      );
      await expect(rx.connect(d1).confirmReceipt(id2)).to.be.revertedWithCustomError(rx, E);
      await expect(rx.connect(d1).rejectTransfer(id2, "x")).to.be.revertedWithCustomError(rx, E);
      await expect(rx.connect(m1).cancelTransfer(id2)).to.be.revertedWithCustomError(rx, E);
      await expect(rx.connect(m1).recallBatch(id, "x")).to.be.revertedWithCustomError(rx, E);
      await expect(rx.connect(m1).attachDocument(id, DOC_HASH)).to.be.revertedWithCustomError(rx, E);
      // views still work
      expect(await verdictOf(rx, id)).to.equal(Verdict.InSupplyChain);

      await expect(rx.unpause()).to.emit(rx, "Unpaused");
      await rx.connect(d1).confirmReceipt(id2);
      expect((await rx.getBatch(id2)).currentOwner).to.equal(d1.address);
    });
  });
});
